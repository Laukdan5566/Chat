import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  Fab,
  IconButton,
  InputBase,
  Paper,
  Toolbar,
  Tooltip,
  Typography,
  makeStyles
} from "@material-ui/core";
import AddIcon from "@material-ui/icons/Add";
import CloseIcon from "@material-ui/icons/Close";
import EditIcon from "@material-ui/icons/Edit";
import InsertDriveFileIcon from "@material-ui/icons/InsertDriveFile";
import SendIcon from "@material-ui/icons/Send";

import LinearWithValueLabel from "../MessageInputCustom/ProgressBarCustom";
import ImageEditorDialog from "../ImageEditorDialog";

const useStyles = makeStyles(theme => ({
  paper: {
    overflow: "hidden",
    backgroundColor: theme.palette.background.default
  },
  toolbar: {
    minHeight: 54,
    gap: theme.spacing(0.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: 600
  },
  content: {
    height: "min(46vh, 360px)",
    minHeight: 220,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing(1.5),
    overflow: "hidden",
    backgroundColor: theme.palette.type === "dark" ? "#101820" : "#f4f5f5"
  },
  previewFrame: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 6,
    backgroundColor: theme.palette.type === "dark" ? "#0b1118" : "#e9ecef"
  },
  previewImage: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    userSelect: "none"
  },
  previewVideo: {
    maxWidth: "100%",
    maxHeight: "100%"
  },
  filePreview: {
    display: "flex",
    maxWidth: "85%",
    flexDirection: "column",
    alignItems: "center",
    gap: theme.spacing(1),
    color: theme.palette.text.secondary,
    textAlign: "center",
    wordBreak: "break-word"
  },
  fileIcon: {
    fontSize: 62
  },
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
    padding: theme.spacing(1, 1.5, 1.25),
    backgroundColor: theme.palette.background.paper,
    borderTop: `1px solid ${theme.palette.divider}`
  },
  captionRow: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1)
  },
  caption: {
    flex: 1,
    minWidth: 0,
    padding: theme.spacing(1, 1.5),
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 20,
    backgroundColor: theme.palette.background.default
  },
  sendButton: {
    flex: "0 0 auto"
  },
  strip: {
    minHeight: 54,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.75),
    overflowX: "auto",
    paddingBottom: 1
  },
  thumbnail: {
    width: 48,
    height: 48,
    flex: "0 0 auto",
    overflow: "hidden",
    padding: 2,
    border: "2px solid transparent",
    borderRadius: 6,
    backgroundColor: theme.palette.background.default,
    cursor: "pointer"
  },
  thumbnailActive: {
    borderColor: theme.palette.primary.main
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: 3
  },
  thumbnailFile: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  addButton: {
    width: 48,
    height: 48,
    flex: "0 0 auto",
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 6
  },
  hiddenInput: {
    display: "none"
  }
}));

const MediaComposerDialog = ({
  open,
  medias,
  caption,
  loading,
  percentLoading,
  onCaptionChange,
  onClose,
  onMediasChange,
  onSend
}) => {
  const classes = useStyles();
  const addInputRef = useRef(null);
  const previewsRef = useRef([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFile, setEditingFile] = useState(null);
  const [editingIndex, setEditingIndex] = useState(0);

  const previews = useMemo(
    () =>
      medias.map(file => ({
        file,
        url: URL.createObjectURL(file),
        type: file?.type?.split("/")[0] || "file"
      })),
    [medias]
  );

  useEffect(() => {
    const previousPreviews = previewsRef.current;
    previewsRef.current = previews;
    previousPreviews.forEach(preview => URL.revokeObjectURL(preview.url));
  }, [previews]);

  useEffect(
    () => () => previewsRef.current.forEach(preview => URL.revokeObjectURL(preview.url)),
    []
  );

  useEffect(() => {
    if (activeIndex >= medias.length) {
      setActiveIndex(Math.max(0, medias.length - 1));
    }
  }, [activeIndex, medias.length]);

  const activePreview = previews[activeIndex] || previews[0];
  const canEdit = activePreview?.type === "image";

  const handleAddFiles = event => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length) {
      onMediasChange([...medias, ...selectedFiles]);
      setActiveIndex(medias.length);
    }
    event.target.value = "";
  };

  const handleOpenEditor = () => {
    if (!activePreview?.file || loading) return;
    setEditingFile(activePreview.file);
    setEditingIndex(activeIndex);
    setEditorOpen(true);
  };

  const handleSaveEditedImage = editedFile => {
    if (!editedFile) return;
    const nextMedias = [...medias];
    nextMedias[editingIndex] = editedFile;
    onMediasChange(nextMedias);
    setActiveIndex(editingIndex);
    setEditorOpen(false);
    setEditingFile(null);
  };

  const renderActivePreview = () => {
    if (!activePreview) return null;
    if (activePreview.type === "image") {
      return <img className={classes.previewImage} src={activePreview.url} alt={activePreview.file.name} />;
    }
    if (activePreview.type === "video") {
      return <video className={classes.previewVideo} src={activePreview.url} controls />;
    }
    return (
      <div className={classes.filePreview}>
        <InsertDriveFileIcon className={classes.fileIcon} />
        <Typography>{activePreview.file.name}</Typography>
      </div>
    );
  };

  return (
    <>
      <Dialog
        open={open}
        fullWidth
        maxWidth="md"
        onClose={loading ? undefined : onClose}
        classes={{ paper: classes.paper }}
      >
        <Toolbar className={classes.toolbar}>
          <Tooltip title="Cancelar anexos">
            <span>
              <IconButton onClick={onClose} disabled={loading} aria-label="Cancelar anexos">
                <CloseIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Typography className={classes.title}>
            Revisar {medias.length > 1 ? `${medias.length} arquivos` : "arquivo"}
          </Typography>
          {canEdit && (
            <Tooltip title="Editar imagem">
              <span>
                <IconButton onClick={handleOpenEditor} disabled={loading} aria-label="Editar imagem">
                  <EditIcon />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Toolbar>

        <div className={classes.content}>
          <div className={classes.previewFrame}>{renderActivePreview()}</div>
        </div>

        <Paper square elevation={0} className={classes.footer}>
          {loading ? (
            <LinearWithValueLabel progress={percentLoading} />
          ) : (
            <div className={classes.captionRow}>
              <InputBase
                autoFocus
                multiline
                maxRows={3}
                className={classes.caption}
                value={caption}
                placeholder="Digite uma legenda"
                onChange={event => onCaptionChange(event.target.value)}
                onKeyDown={event => {
                  if (!event.shiftKey && event.key === "Enter") {
                    event.preventDefault();
                    onSend(event);
                  }
                }}
              />
              <Fab
                size="medium"
                color="primary"
                className={classes.sendButton}
                onClick={onSend}
                disabled={loading || medias.length === 0}
                aria-label="Enviar arquivos"
              >
                <SendIcon />
              </Fab>
            </div>
          )}

          <div className={classes.strip}>
            {previews.map((preview, index) => (
              <button
                type="button"
                key={`${preview.file.name}-${preview.file.lastModified}-${index}`}
                className={`${classes.thumbnail} ${index === activeIndex ? classes.thumbnailActive : ""}`}
                onClick={() => setActiveIndex(index)}
                disabled={loading}
                aria-label={`Selecionar ${preview.file.name}`}
              >
                {preview.type === "image" ? (
                  <img className={classes.thumbnailImage} src={preview.url} alt={preview.file.name} />
                ) : (
                  <span className={classes.thumbnailFile}><InsertDriveFileIcon /></span>
                )}
              </button>
            ))}
            <input ref={addInputRef} multiple type="file" className={classes.hiddenInput} onChange={handleAddFiles} />
            <IconButton
              className={classes.addButton}
              onClick={() => addInputRef.current?.click()}
              disabled={loading}
              aria-label="Adicionar arquivo"
            >
              <AddIcon />
            </IconButton>
          </div>
        </Paper>
      </Dialog>

      <ImageEditorDialog
        open={editorOpen}
        file={editingFile}
        onClose={() => {
          setEditorOpen(false);
          setEditingFile(null);
        }}
        onSave={handleSaveEditedImage}
      />
    </>
  );
};

export default MediaComposerDialog;
