import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppBar,
  Button,
  CircularProgress,
  Dialog,
  IconButton,
  InputBase,
  Toolbar,
  Tooltip,
  Typography,
  makeStyles
} from "@material-ui/core";
import BrushIcon from "@material-ui/icons/Brush";
import CheckIcon from "@material-ui/icons/Check";
import CloseIcon from "@material-ui/icons/Close";
import CropIcon from "@material-ui/icons/Crop";
import RestoreIcon from "@material-ui/icons/Restore";
import RotateLeftIcon from "@material-ui/icons/RotateLeft";
import RotateRightIcon from "@material-ui/icons/RotateRight";
import TextFieldsIcon from "@material-ui/icons/TextFields";
import UndoIcon from "@material-ui/icons/Undo";

const MAX_IMAGE_DIMENSION = 4096;
const MAX_HISTORY_STEPS = 12;

const useStyles = makeStyles(theme => ({
  paper: { backgroundColor: "#141414" },
  appBar: {
    position: "relative",
    backgroundColor: "#141414",
    color: "#f5f5f5",
    boxShadow: "none",
    borderBottom: "1px solid #333"
  },
  toolbar: { minHeight: 58, gap: theme.spacing(0.5), overflowX: "auto" },
  spacer: { flex: 1 },
  activeTool: { color: theme.palette.primary.main, backgroundColor: "rgba(255, 255, 255, 0.1)" },
  colorInput: {
    width: 32,
    height: 32,
    padding: 0,
    border: 0,
    borderRadius: "50%",
    overflow: "hidden",
    backgroundColor: "transparent",
    cursor: "pointer"
  },
  widthInput: { width: 84 },
  textInput: {
    minWidth: 140,
    maxWidth: 260,
    padding: theme.spacing(0.5, 1),
    color: "#fff",
    border: "1px solid #555",
    borderRadius: 4
  },
  stage: {
    height: "calc(100vh - 59px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing(2),
    overflow: "auto",
    backgroundColor: "#181818"
  },
  canvasWrap: { position: "relative", display: "inline-flex", maxWidth: "100%", maxHeight: "100%" },
  canvas: {
    display: "block",
    maxWidth: "100%",
    maxHeight: "calc(100vh - 92px)",
    boxShadow: "0 4px 24px rgba(0, 0, 0, 0.45)",
    touchAction: "none"
  },
  cropBox: {
    position: "absolute",
    border: "2px solid #18c8e8",
    backgroundColor: "rgba(24, 200, 232, 0.12)",
    pointerEvents: "none",
    boxSizing: "border-box"
  },
  loading: { color: theme.palette.primary.main },
  error: {
    maxWidth: 360,
    color: "#f5f5f5",
    padding: theme.spacing(2),
    textAlign: "center",
    border: "1px solid #444",
    borderRadius: 6,
    backgroundColor: "#222"
  }
}));

const getOutputDetails = file => {
  const isJpeg = file?.type === "image/jpeg";
  const extension = isJpeg ? "jpg" : "png";
  const baseName = (file?.name || `imagem-${Date.now()}`).replace(/\.[^.]+$/, "");
  return { mimeType: isJpeg ? "image/jpeg" : "image/png", fileName: `${baseName}-editado.${extension}` };
};

const ImageEditorDialog = ({ open, file, onClose, onSave }) => {
  const classes = useStyles();
  const canvasRef = useRef(null);
  const historyRef = useRef([]);
  const drawingRef = useRef(false);
  const cropStartRef = useRef(null);
  const sourceRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState("draw");
  const [color, setColor] = useState("#18c8e8");
  const [lineWidth, setLineWidth] = useState(8);
  const [text, setText] = useState("");
  const [historySize, setHistorySize] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [cropRect, setCropRect] = useState(null);

  const drawImageSource = useCallback((source, preserveDimensions = false) => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;

    setReady(false);
    const image = new Image();
    image.onload = () => {
      const scale = preserveDimensions ? 1 : Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = preserveDimensions ? image.naturalWidth : Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = preserveDimensions ? image.naturalHeight : Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      setCropRect(null);
      setLoadError("");
      setReady(true);
    };
    image.onerror = () => {
      setReady(false);
      setLoadError("Nao foi possivel abrir essa imagem para edicao.");
    };
    image.src = source;
  }, []);

  const loadOriginal = useCallback(() => {
    if (!sourceRef.current) return;
    historyRef.current = [];
    setHistorySize(0);
    drawImageSource(sourceRef.current);
  }, [drawImageSource]);

  useEffect(() => {
    if (!open || !file) return undefined;
    let cancelled = false;
    const reader = new FileReader();
    setReady(false);
    setLoadError("");
    setCropRect(null);
    reader.onload = event => {
      if (cancelled || typeof event.target?.result !== "string") return;
      sourceRef.current = event.target.result;
      historyRef.current = [];
      setHistorySize(0);
      drawImageSource(event.target.result);
    };
    reader.onerror = () => {
      if (!cancelled) setLoadError("Nao foi possivel ler essa imagem para edicao.");
    };
    reader.readAsDataURL(file);
    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [drawImageSource, file, open]);

  const pushHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY_STEPS - 1)), canvas.toDataURL("image/png")];
    setHistorySize(historyRef.current.length);
  };

  const getPoint = event => {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, ((event.clientX - bounds.left) * canvas.width) / bounds.width)),
      y: Math.max(0, Math.min(canvas.height, ((event.clientY - bounds.top) * canvas.height) / bounds.height))
    };
  };

  const normalizeCrop = (start, end) => ({
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  });

  const handlePointerDown = event => {
    if (!ready || saving) return;
    const canvas = canvasRef.current;
    const point = getPoint(event);
    canvas.setPointerCapture?.(event.pointerId);

    if (mode === "crop") {
      cropStartRef.current = point;
      setCropRect({ x: point.x, y: point.y, width: 0, height: 0 });
      return;
    }

    pushHistory();
    const context = canvas.getContext("2d");
    if (mode === "text") {
      if (!text.trim()) {
        historyRef.current.pop();
        setHistorySize(historyRef.current.length);
        return;
      }
      const fontSize = Math.max(24, lineWidth * 5);
      context.font = `600 ${fontSize}px Arial, sans-serif`;
      context.textBaseline = "top";
      context.lineJoin = "round";
      context.lineWidth = Math.max(2, fontSize / 12);
      context.strokeStyle = "rgba(0, 0, 0, 0.75)";
      context.fillStyle = color;
      context.strokeText(text.trim(), point.x, point.y);
      context.fillText(text.trim(), point.x, point.y);
      setText("");
      return;
    }

    drawingRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
  };

  const handlePointerMove = event => {
    if (!ready) return;
    if (mode === "crop" && cropStartRef.current) {
      setCropRect(normalizeCrop(cropStartRef.current, getPoint(event)));
      return;
    }
    if (!drawingRef.current || mode !== "draw") return;
    const context = canvasRef.current.getContext("2d");
    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const handlePointerUp = event => {
    if (mode === "crop") {
      if (cropStartRef.current) setCropRect(normalizeCrop(cropStartRef.current, getPoint(event)));
      cropStartRef.current = null;
      canvasRef.current?.releasePointerCapture?.(event.pointerId);
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current = false;
    canvasRef.current.releasePointerCapture?.(event.pointerId);
    canvasRef.current.getContext("2d").closePath();
  };

  const handleUndo = () => {
    const previousState = historyRef.current.pop();
    if (!previousState) return;
    setHistorySize(historyRef.current.length);
    drawImageSource(previousState, true);
  };

  const rotate = direction => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    pushHistory();
    const snapshot = document.createElement("canvas");
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshot.getContext("2d").drawImage(canvas, 0, 0);
    canvas.width = snapshot.height;
    canvas.height = snapshot.width;
    const context = canvas.getContext("2d");
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((direction * Math.PI) / 2);
    context.drawImage(snapshot, -snapshot.width / 2, -snapshot.height / 2);
  };

  const applyCrop = () => {
    const canvas = canvasRef.current;
    if (!canvas || !cropRect || cropRect.width < 4 || cropRect.height < 4) return;
    pushHistory();
    const snapshot = document.createElement("canvas");
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshot.getContext("2d").drawImage(canvas, 0, 0);
    canvas.width = Math.round(cropRect.width);
    canvas.height = Math.round(cropRect.height);
    canvas.getContext("2d").drawImage(snapshot, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, canvas.width, canvas.height);
    setCropRect(null);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !ready || saving) return;
    setSaving(true);
    const { mimeType, fileName } = getOutputDetails(file);
    try {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => (result ? resolve(result) : reject(new Error("Falha ao editar imagem"))), mimeType, 0.9);
      });
      onSave(new File([blob], fileName, { type: mimeType, lastModified: Date.now() }));
    } finally {
      setSaving(false);
    }
  };

  const cropStyle = cropRect
    ? { left: `${(cropRect.x / canvasRef.current?.width) * 100}%`, top: `${(cropRect.y / canvasRef.current?.height) * 100}%`, width: `${(cropRect.width / canvasRef.current?.width) * 100}%`, height: `${(cropRect.height / canvasRef.current?.height) * 100}%` }
    : undefined;

  return (
    <Dialog fullScreen open={open} onClose={saving ? undefined : onClose} classes={{ paper: classes.paper }}>
      <AppBar className={classes.appBar}>
        <Toolbar className={classes.toolbar}>
          <Tooltip title="Fechar"><span><IconButton color="inherit" onClick={onClose} disabled={saving}><CloseIcon /></IconButton></span></Tooltip>
          <Tooltip title="Desenhar"><span><IconButton color="inherit" className={mode === "draw" ? classes.activeTool : undefined} onClick={() => { setMode("draw"); setCropRect(null); }} disabled={!ready || saving}><BrushIcon /></IconButton></span></Tooltip>
          <Tooltip title="Recortar"><span><IconButton color="inherit" className={mode === "crop" ? classes.activeTool : undefined} onClick={() => setMode("crop")} disabled={!ready || saving}><CropIcon /></IconButton></span></Tooltip>
          {mode === "crop" && cropRect?.width >= 4 && cropRect?.height >= 4 && <Button color="inherit" onClick={applyCrop} disabled={saving}>Recortar</Button>}
          <Tooltip title="Adicionar texto"><span><IconButton color="inherit" className={mode === "text" ? classes.activeTool : undefined} onClick={() => { setMode("text"); setCropRect(null); }} disabled={!ready || saving}><TextFieldsIcon /></IconButton></span></Tooltip>
          {mode === "text" && <InputBase className={classes.textInput} value={text} placeholder="Texto e toque na imagem" onChange={event => setText(event.target.value)} />}
          <Tooltip title="Cor"><input aria-label="Cor da marcacao" className={classes.colorInput} type="color" value={color} onChange={event => setColor(event.target.value)} disabled={!ready || saving} /></Tooltip>
          <Tooltip title="Espessura"><input aria-label="Espessura da marcacao" className={classes.widthInput} type="range" min="2" max="30" value={lineWidth} onChange={event => setLineWidth(Number(event.target.value))} disabled={!ready || saving} /></Tooltip>
          <Tooltip title="Desfazer"><span><IconButton color="inherit" onClick={handleUndo} disabled={!historySize || saving}><UndoIcon /></IconButton></span></Tooltip>
          <Tooltip title="Girar para a esquerda"><span><IconButton color="inherit" onClick={() => rotate(-1)} disabled={!ready || saving}><RotateLeftIcon /></IconButton></span></Tooltip>
          <Tooltip title="Girar para a direita"><span><IconButton color="inherit" onClick={() => rotate(1)} disabled={!ready || saving}><RotateRightIcon /></IconButton></span></Tooltip>
          <Tooltip title="Restaurar original"><span><IconButton color="inherit" onClick={loadOriginal} disabled={!ready || saving}><RestoreIcon /></IconButton></span></Tooltip>
          <span className={classes.spacer} />
          <Button color="inherit" startIcon={saving ? <CircularProgress size={18} /> : <CheckIcon />} onClick={handleSave} disabled={!ready || saving}>Aplicar</Button>
        </Toolbar>
      </AppBar>
      <div className={classes.stage}>
        {!ready && !loadError && <CircularProgress className={classes.loading} />}
        {loadError && <Typography variant="body2" className={classes.error}>{loadError}</Typography>}
        <div className={classes.canvasWrap} style={{ display: ready ? "inline-flex" : "none" }}>
          <canvas ref={canvasRef} className={classes.canvas} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} />
          {cropRect && <div className={classes.cropBox} style={cropStyle} />}
        </div>
      </div>
    </Dialog>
  );
};

export default ImageEditorDialog;
