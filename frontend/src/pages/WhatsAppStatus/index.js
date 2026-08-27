import React, { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import {
  Audiotrack,
  Close,
  Image,
  InsertPhoto,
  People,
  Search,
  Send,
  Videocam
} from "@material-ui/icons";
import { toast } from "react-toastify";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
  mainPaper: {
    flex: 1,
    overflowY: "auto",
    padding: theme.spacing(2),
    ...theme.scrollbarStyles
  },
  workspace: {
    maxWidth: 1180,
    width: "100%",
    margin: "0 auto"
  },
  composer: {
    padding: theme.spacing(2),
    borderRadius: 8
  },
  preview: {
    minHeight: 470,
    position: "relative",
    overflow: "hidden",
    borderRadius: 8,
    background: "#111827",
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between"
  },
  previewMedia: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover"
  },
  previewShade: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(180deg, rgba(0,0,0,.36), rgba(0,0,0,.12) 42%, rgba(0,0,0,.56))"
  },
  previewHeader: {
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    padding: theme.spacing(2)
  },
  previewBody: {
    zIndex: 1,
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing(3),
    textAlign: "center",
    whiteSpace: "pre-wrap"
  },
  previewCaption: {
    zIndex: 1,
    margin: theme.spacing(2),
    padding: theme.spacing(1.5, 2),
    borderRadius: 8,
    background: "rgba(0,0,0,.55)",
    whiteSpace: "pre-wrap"
  },
  actionRow: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    flexWrap: "wrap"
  },
  attachment: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    border: `1px dashed ${theme.palette.divider}`,
    borderRadius: 8,
    padding: theme.spacing(1, 1.5),
    marginTop: theme.spacing(1)
  },
  contactsList: {
    height: 250,
    overflowY: "auto",
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 8,
    marginTop: theme.spacing(1),
    ...theme.scrollbarStyles
  },
  history: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(2),
    borderRadius: 8
  },
  historyItem: {
    padding: theme.spacing(1, 0),
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing(2)
  },
  colorInput: {
    width: 44,
    height: 38,
    border: 0,
    padding: 0,
    background: "transparent",
    cursor: "pointer"
  },
  audioPreview: {
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: theme.spacing(1)
  }
}));

const fileIcon = type => {
  if (type?.startsWith("video/")) return <Videocam />;
  if (type?.startsWith("audio/")) return <Audiotrack />;
  return <Image />;
};

const WhatsAppStatus = () => {
  const classes = useStyles();
  const [connections, setConnections] = useState([]);
  const [history, setHistory] = useState([]);
  const [whatsappId, setWhatsappId] = useState("");
  const [contacts, setContacts] = useState([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [audienceMode, setAudienceMode] = useState("all");
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [body, setBody] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("#1f2937");
  const [media, setMedia] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const selectedConnection = useMemo(
    () => connections.find(connection => String(connection.id) === String(whatsappId)),
    [connections, whatsappId]
  );

  const loadHistory = async () => {
    const { data } = await api.get("/whatsapp-status/history");
    setHistory(data);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [{ data: connectionData }] = await Promise.all([
          api.get("/whatsapp-status/connections"),
          loadHistory()
        ]);
        if (!active) return;
        setConnections(connectionData);
        if (connectionData.length) setWhatsappId(String(connectionData[0].id));
      } catch (error) {
        if (active) toastError(error);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!whatsappId) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/whatsapp-status/${whatsappId}/contacts`, {
          params: { search }
        });
        if (active) {
          setContacts(data.contacts || []);
          setContactsTotal(data.total || 0);
        }
      } catch (error) {
        if (active) toastError(error);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [whatsappId, search]);

  useEffect(() => {
    if (!media) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(media);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [media]);

  const toggleContact = contactId => {
    setSelectedContacts(current =>
      current.includes(contactId)
        ? current.filter(id => id !== contactId)
        : [...current, contactId]
    );
  };

  const handleConnectionChange = event => {
    setWhatsappId(event.target.value);
    setSelectedContacts([]);
    setSearch("");
  };

  const handleMediaChange = event => {
    const file = event.target.files?.[0] || null;
    if (file && !/^(image|video|audio)\//.test(file.type)) {
      toast.error("Selecione uma imagem, vídeo ou áudio.");
      event.target.value = "";
      return;
    }
    setMedia(file);
  };

  const handlePublish = async () => {
    if (!whatsappId) {
      toast.error("Escolha uma conexão do WhatsApp.");
      return;
    }
    if (!body.trim() && !media) {
      toast.error("Informe uma mensagem ou selecione uma mídia.");
      return;
    }
    if (audienceMode === "selected" && !selectedContacts.length) {
      toast.error("Selecione pelo menos um contato.");
      return;
    }

    const formData = new FormData();
    formData.append("whatsappId", whatsappId);
    formData.append("body", body);
    formData.append("backgroundColor", backgroundColor);
    if (audienceMode === "selected") {
      formData.append("recipientIds", JSON.stringify(selectedContacts));
    }
    if (media) formData.append("media", media);

    setPublishing(true);
    try {
      await api.post("/whatsapp-status", formData);
      toast.success("Status publicado no WhatsApp.");
      setBody("");
      setMedia(null);
      setSelectedContacts([]);
      await loadHistory();
    } catch (error) {
      toastError(error);
    } finally {
      setPublishing(false);
    }
  };

  const previewHasMedia = Boolean(previewUrl && media);

  return (
    <MainContainer>
      <MainHeader>
        <Title>Status do WhatsApp</Title>
        <MainHeaderButtonsWrapper>
          <Typography variant="body2" color="textSecondary">
            Publicação manual para contatos sincronizados
          </Typography>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <Paper className={classes.mainPaper} variant="outlined">
        {loading ? (
          <Box display="flex" justifyContent="center" p={5}>
            <CircularProgress />
          </Box>
        ) : !connections.length ? (
          <Box p={4} textAlign="center">
            <Typography variant="h6">Nenhuma conexão WhatsApp ativa</Typography>
            <Typography color="textSecondary">
              Conecte um WhatsApp antes de publicar um status.
            </Typography>
          </Box>
        ) : (
          <div className={classes.workspace}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={5}>
                <div
                  className={classes.preview}
                  style={{ backgroundColor: previewHasMedia ? "#111827" : backgroundColor }}
                >
                  {previewHasMedia && media.type.startsWith("image/") && (
                    <img className={classes.previewMedia} src={previewUrl} alt="Prévia do status" />
                  )}
                  {previewHasMedia && media.type.startsWith("video/") && (
                    <video className={classes.previewMedia} src={previewUrl} controls />
                  )}
                  {previewHasMedia && media.type.startsWith("audio/") && (
                    <div className={classes.previewBody}>
                      <div className={classes.audioPreview}>
                        <Audiotrack fontSize="large" />
                        <audio controls src={previewUrl} />
                      </div>
                    </div>
                  )}
                  {previewHasMedia && !media.type.startsWith("audio/") && (
                    <div className={classes.previewShade} />
                  )}
                  <div className={classes.previewHeader}>
                    <InsertPhoto />
                    <div>
                      <Typography variant="subtitle2">Meu status</Typography>
                      <Typography variant="caption">Prévia antes de publicar</Typography>
                    </div>
                  </div>
                  {!previewHasMedia && (
                    <div className={classes.previewBody}>
                      <Typography variant="h5">{body || "Digite uma atualização"}</Typography>
                    </div>
                  )}
                  {previewHasMedia && body && (
                    <Typography className={classes.previewCaption}>{body}</Typography>
                  )}
                </div>
              </Grid>

              <Grid item xs={12} md={7}>
                <Paper className={classes.composer} variant="outlined">
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={8}>
                      <FormControl fullWidth variant="outlined" size="small">
                        <InputLabel id="status-connection-label">Conexão</InputLabel>
                        <Select
                          labelId="status-connection-label"
                          label="Conexão"
                          value={whatsappId}
                          onChange={handleConnectionChange}
                        >
                          {connections.map(connection => (
                            <MenuItem key={connection.id} value={String(connection.id)}>
                              {connection.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Box display="flex" alignItems="center" height="100%" gridGap={8}>
                        <Typography variant="body2">Cor de fundo</Typography>
                        <input
                          aria-label="Cor do status"
                          className={classes.colorInput}
                          type="color"
                          value={backgroundColor}
                          onChange={event => setBackgroundColor(event.target.value)}
                        />
                      </Box>
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        multiline
                        rows={4}
                        variant="outlined"
                        label="Digite uma atualização"
                        value={body}
                        onChange={event => setBody(event.target.value)}
                        inputProps={{ maxLength: 700 }}
                        helperText={`${body.length}/700`}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <div className={classes.actionRow}>
                        <input
                          accept="image/*,video/*,audio/*"
                          id="status-media-input"
                          type="file"
                          hidden
                          onChange={handleMediaChange}
                        />
                        <label htmlFor="status-media-input">
                          <Button component="span" startIcon={<InsertPhoto />} variant="outlined">
                            Adicionar mídia
                          </Button>
                        </label>
                        {media && (
                          <div className={classes.attachment}>
                            <Box display="flex" alignItems="center" gridGap={8}>
                              {fileIcon(media.type)}
                              <Typography variant="body2" noWrap>{media.name}</Typography>
                            </Box>
                            <Button size="small" onClick={() => setMedia(null)} aria-label="Remover mídia">
                              <Close fontSize="small" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </Grid>

                    <Grid item xs={12}>
                      <Divider />
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="subtitle1">Público</Typography>
                      <Typography variant="body2" color="textSecondary">
                        O Status será publicado somente para contatos sincronizados em {selectedConnection?.name || "esta conexão"}.
                      </Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <div className={classes.actionRow}>
                        <Button
                          variant={audienceMode === "all" ? "contained" : "outlined"}
                          color="primary"
                          startIcon={<People />}
                          onClick={() => setAudienceMode("all")}
                        >
                          Todos os sincronizados ({contactsTotal})
                        </Button>
                        <Button
                          variant={audienceMode === "selected" ? "contained" : "outlined"}
                          color="primary"
                          onClick={() => setAudienceMode("selected")}
                        >
                          Escolher contatos {selectedContacts.length ? `(${selectedContacts.length})` : ""}
                        </Button>
                      </div>
                    </Grid>
                    {audienceMode === "selected" && (
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          size="small"
                          variant="outlined"
                          placeholder="Buscar contato sincronizado"
                          value={search}
                          onChange={event => setSearch(event.target.value)}
                          InputProps={{ startAdornment: <Search color="action" style={{ marginRight: 8 }} /> }}
                        />
                        <List className={classes.contactsList} dense>
                          {contacts.map(contact => (
                            <ListItem button key={contact.id} onClick={() => toggleContact(contact.id)}>
                              <ListItemIcon>
                                <Checkbox
                                  edge="start"
                                  checked={selectedContacts.includes(contact.id)}
                                  tabIndex={-1}
                                  disableRipple
                                />
                              </ListItemIcon>
                              <ListItemText primary={contact.name} secondary={contact.id.replace("@s.whatsapp.net", "")} />
                            </ListItem>
                          ))}
                          {!contacts.length && (
                            <ListItem><ListItemText primary="Nenhum contato sincronizado encontrado." /></ListItem>
                          )}
                        </List>
                      </Grid>
                    )}
                    <Grid item xs={12}>
                      <Box display="flex" justifyContent="flex-end">
                        <Button
                          color="primary"
                          variant="contained"
                          size="large"
                          startIcon={publishing ? <CircularProgress color="inherit" size={18} /> : <Send />}
                          disabled={publishing}
                          onClick={handlePublish}
                        >
                          Publicar status
                        </Button>
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            </Grid>

            <Paper className={classes.history} variant="outlined">
              <Typography variant="subtitle1">Publicações recentes</Typography>
              {!history.length ? (
                <Typography variant="body2" color="textSecondary">Nenhum status publicado por esta empresa ainda.</Typography>
              ) : history.map((post, index) => (
                <React.Fragment key={post.id}>
                  {index > 0 && <Divider />}
                  <div className={classes.historyItem}>
                    <div>
                      <Typography variant="body2">{post.body || post.mediaName || "Mídia sem legenda"}</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {post.whatsapp?.name} por {post.user?.name} em {format(parseISO(post.createdAt), "dd/MM/yyyy HH:mm")}
                      </Typography>
                    </div>
                    <Typography variant="body2" color="textSecondary">{post.recipientsCount} contatos</Typography>
                  </div>
                </React.Fragment>
              ))}
            </Paper>
          </div>
        )}
      </Paper>
    </MainContainer>
  );
};

export default WhatsAppStatus;
