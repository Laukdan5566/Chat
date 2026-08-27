import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Container,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography
} from "@material-ui/core";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import AddIcon from "@material-ui/icons/Add";
import FileCopyOutlinedIcon from "@material-ui/icons/FileCopyOutlined";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const emptyConsultant = () => ({ queueId: "", label: "", active: true });
const defaultBotMessages = {
  menuIntro: "Ol\u00e1! Para agilizar seu atendimento, escolha uma op\u00e7\u00e3o:",
  consultantPrompt: "Escolha sua consultora:",
  noConsultants: "No momento n\u00e3o h\u00e1 consultoras dispon\u00edveis. Vou encaminhar voc\u00ea para novos atendimentos.",
  newConsultant: "Certo! Vou encaminhar voc\u00ea para uma consultora dispon\u00edvel. Aguarde um instante.",
  selectedConsultant: "Perfeito! Vou encaminhar seu atendimento para {{consultora}}. Aguarde um instante.",
  invalidOption: "N\u00e3o entendi essa op\u00e7\u00e3o."
};

const parseBotMessages = value => {
  try {
    const parsed = value ? JSON.parse(value) : {};
    return Object.keys(defaultBotMessages).reduce(
      (messages, key) => ({ ...messages, [key]: parsed[key] || defaultBotMessages[key] }),
      {}
    );
  } catch {
    return { ...defaultBotMessages };
  }
};

const SalesRouting = () => {
  const [config, setConfig] = useState(null);
  const [queues, setQueues] = useState([]);
  const [whatsapps, setWhatsapps] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/sales-routing"), api.get("/queue"), api.get("/whatsapp/")])
      .then(([configResponse, queuesResponse, whatsappsResponse]) => {
        const saved = configResponse.data || {};
        setConfig({
          enabled: Boolean(saved.enabled),
          title: saved.title || "Atendimento comercial",
          whatsappId: saved.whatsappId || "",
          whatsappNumber: saved.whatsappNumber || "",
          newQueueId: saved.newQueueId || "",
          receptionQueueId: saved.receptionQueueId || saved.newQueueId || "",
          publicId: saved.publicId || "",
          botMessages: parseBotMessages(saved.botMessages),
          consultants: (saved.consultants || []).map(item => ({
            id: item.id,
            queueId: item.queueId,
            label: item.label,
            active: item.active !== false,
            sortOrder: item.sortOrder
          }))
        });
        setQueues(queuesResponse.data || []);
        setWhatsapps((whatsappsResponse.data || []).filter(item => item.channel === "whatsapp"));
      })
      .catch(toastError);
  }, []);

  const publicLink = useMemo(
    () => (config?.publicId ? `${window.location.origin}/r/${config.publicId}` : ""),
    [config?.publicId]
  );

  const setField = (field, value) => setConfig(current => ({ ...current, [field]: value }));
  const setConsultant = (index, field, value) => {
    setConfig(current => ({
      ...current,
      consultants: current.consultants.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await api.put("/sales-routing", {
        ...config,
        botMessages: JSON.stringify(config.botMessages)
      });
      setConfig(current => ({
        ...current,
        ...response.data,
        botMessages: parseBotMessages(response.data.botMessages)
      }));
      toast.success("Roteamento comercial salvo.");
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    if (!publicLink) return;
    await navigator.clipboard.writeText(publicLink);
    toast.success("Link copiado.");
  };

  if (!config) return null;

  return (
    <Container maxWidth="md" style={{ paddingTop: 28, paddingBottom: 28 }}>
      <Typography variant="h5" gutterBottom>
        Roteamento comercial
      </Typography>
      <Typography color="textSecondary" paragraph>
        {"Clientes vinculados seguem para a consultora respons\u00e1vel. Os demais s\u00e3o distribu\u00eddos entre as consultoras online."}
      </Typography>
      <Paper style={{ padding: 24 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>{"Conex\u00e3o central"}</InputLabel>
              <Select value={config.whatsappId} onChange={event => setField("whatsappId", event.target.value)}>
                {whatsapps.map(whatsapp => <MenuItem key={whatsapp.id} value={whatsapp.id}>{whatsapp.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label={"N\u00famero central com DDI"} value={config.whatsappNumber} onChange={event => setField("whatsappNumber", event.target.value)} helperText="Ex.: 5527999999999" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Fila de novos contatos pelo link</InputLabel>
              <Select value={config.newQueueId} onChange={event => setField("newQueueId", event.target.value)}>
                {queues.map(queue => <MenuItem key={queue.id} value={queue.id}>{queue.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Fila de conting\u00eancia sem consultoras online</InputLabel>
              <Select value={config.receptionQueueId} onChange={event => setField("receptionQueueId", event.target.value)}>
                {queues.map(queue => <MenuItem key={queue.id} value={queue.id}>{queue.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label={"T\u00edtulo no link p\u00fablico"} value={config.title} onChange={event => setField("title", event.target.value)} />
          </Grid>
        </Grid>

        <Box mt={4} mb={1} display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Consultoras</Typography>
          <Button startIcon={<AddIcon />} onClick={() => setConfig(current => ({ ...current, consultants: [...current.consultants, emptyConsultant()] }))}>Adicionar</Button>
        </Box>
        {config.consultants.map((consultant, index) => (
          <Grid container spacing={2} alignItems="center" key={consultant.id || index}>
            <Grid item xs={12} sm={5}>
              <FormControl fullWidth>
                <InputLabel>Fila da consultora</InputLabel>
                <Select value={consultant.queueId} onChange={event => setConsultant(index, "queueId", event.target.value)}>
                  {queues.map(queue => <MenuItem key={queue.id} value={queue.id}>{queue.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={10} sm={5}>
              <TextField fullWidth label="Nome exibido" value={consultant.label} onChange={event => setConsultant(index, "label", event.target.value)} />
            </Grid>
            <Grid item xs={2} sm={2}>
              <IconButton aria-label="Remover consultora" onClick={() => setConfig(current => ({ ...current, consultants: current.consultants.filter((_, itemIndex) => itemIndex !== index) }))}><DeleteOutlineIcon /></IconButton>
            </Grid>
          </Grid>
        ))}

        <Box mt={4} mb={1}>
          <Typography variant="h6">Mensagens do bot</Typography>
          <Typography color="textSecondary">
            {"Use "}{"{{consultora}}"}{" na mensagem que cita a respons\u00e1vel pelo atendimento."}
          </Typography>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField fullWidth multiline rows={2} label="Mensagem inicial" value={config.botMessages.menuIntro} onChange={event => setField("botMessages", { ...config.botMessages, menuIntro: event.target.value })} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth multiline rows={2} label="Pedido para escolher consultora" value={config.botMessages.consultantPrompt} onChange={event => setField("botMessages", { ...config.botMessages, consultantPrompt: event.target.value })} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth multiline rows={2} label={"Quando n\u00e3o houver consultoras"} value={config.botMessages.noConsultants} onChange={event => setField("botMessages", { ...config.botMessages, noConsultants: event.target.value })} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth multiline rows={2} label="Novo atendimento" value={config.botMessages.newConsultant} onChange={event => setField("botMessages", { ...config.botMessages, newConsultant: event.target.value })} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth multiline rows={2} label="Consultora escolhida" value={config.botMessages.selectedConsultant} onChange={event => setField("botMessages", { ...config.botMessages, selectedConsultant: event.target.value })} helperText="Aceita {{consultora}}" />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth multiline rows={2} label={"Op\u00e7\u00e3o inv\u00e1lida"} value={config.botMessages.invalidOption} onChange={event => setField("botMessages", { ...config.botMessages, invalidOption: event.target.value })} />
          </Grid>
        </Grid>

        <Box mt={4} display="flex" flexWrap="wrap" gridGap={12} alignItems="center">
          <Button variant="contained" color="primary" disabled={saving} onClick={save}>Salvar</Button>
          <Button variant="outlined" startIcon={<FileCopyOutlinedIcon />} disabled={!publicLink} onClick={copyLink}>Copiar link</Button>
          {publicLink && <Typography color="textSecondary" style={{ overflowWrap: "anywhere" }}>{publicLink}</Typography>}
        </Box>
      </Paper>
    </Container>
  );
};

export default SalesRouting;
