import React, { useContext, useState, useEffect } from "react";
import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  Button,
  DialogActions,
  CircularProgress,
  TextField,
  Switch,
  FormControlLabel,
  FormControl,
  FormGroup,
  Typography,
  Tooltip,
  Paper,
  Grid,
  Checkbox,
  MenuItem
} from "@material-ui/core";

import api from "../../services/api";
import { getBackendURL } from "../../services/config";
import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import QueueSelect from "../QueueSelect";
import HelpOutlineOutlinedIcon from "@material-ui/icons/HelpOutlineOutlined";

import { SelectLanguage } from "../SelectLanguage";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    flexWrap: "wrap"
  },

  multFieldLine: {
    display: "flex",
    "& > *:not(:last-child)": {
      marginRight: theme.spacing(1)
    }
  },

  btnWrapper: {
    position: "relative"
  },

  buttonProgress: {
    color: green[500],
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -12,
    marginLeft: -12
  }
}));

const SessionSchema = Yup.object().shape({
  name: Yup.string()
    .min(2, "Too Short!")
    .max(50, "Too Long!")
    .required("Required")
});

const WhatsAppModal = ({ open, onClose, whatsAppId }) => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const plan = user?.company?.plan || {};
  const canUseFacebook = Boolean(plan.facebookEnabled);
  const canUseInstagram = Boolean(plan.instagramEnabled);
  const initialState = {
    name: "",
    greetingMessage: "",
    complationMessage: "",
    outOfHoursMessage: "",
    ratingMessage: "",
    transferMessage: "",
    isDefault: false,
    token: "",
    channel: "whatsapp",
    facebookPageUserId: "",
    facebookUserId: "",
    facebookUserToken: "",
    tokenMeta: "",
    provider: "beta",
    apiToken: "",
    apiChannelId: "",
    apiWebhookSecret: "",
    language: localStorage.getItem("language") || ""
  };
  const [whatsApp, setWhatsApp] = useState(initialState);
  const [selectedQueueIds, setSelectedQueueIds] = useState([]);

  useEffect(() => {
    const fetchSession = async () => {
      if (!whatsAppId) return;

      try {
        const { data } = await api.get(`whatsapp/${whatsAppId}?session=0`);
        setWhatsApp(data);

        const whatsQueueIds = data.queues?.map(queue => queue.id);
        setSelectedQueueIds(whatsQueueIds);
      } catch (err) {
        toastError(err);
      }
    };
    fetchSession();
  }, [whatsAppId]);

  const handleSaveWhatsApp = async values => {
    if (values.channel === "facebook" && !canUseFacebook) {
      toast.error("Facebook Messenger nao esta habilitado no plano da empresa.");
      return;
    }

    if (values.channel === "instagram" && !canUseInstagram) {
      toast.error("Instagram Direct nao esta habilitado no plano da empresa.");
      return;
    }

    const whatsappData = {
      ...values,
      isDefault: values.channel === "whatsapp" ? values.isDefault : false,
      queueIds: selectedQueueIds
    };
    delete whatsappData["queues"];
    delete whatsappData["session"];

    try {
      if (whatsAppId) {
        await api.put(`/whatsapp/${whatsAppId}`, whatsappData);
      } else {
        await api.post("/whatsapp", whatsappData);
      }
      toast.success(i18n.t("whatsappModal.success"));
      handleClose();
    } catch (err) {
      toastError(err);
    }
  };

  const handleClose = () => {
    onClose();
    setWhatsApp(initialState);
  };

  return (
    <div className={classes.root}>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        scroll="paper"
      >
        <DialogTitle>
          {whatsAppId
            ? i18n.t("whatsappModal.title.edit")
            : i18n.t("whatsappModal.title.add")}
        </DialogTitle>
        <Formik
          initialValues={whatsApp}
          enableReinitialize={true}
          validationSchema={SessionSchema}
          onSubmit={(values, actions) => {
            setTimeout(() => {
              handleSaveWhatsApp(values);
              actions.setSubmitting(false);
            }, 400);
          }}
        >
          {({ values, touched, errors, isSubmitting }) => (
            <Form>
              <DialogContent dividers>
                <div className={classes.multFieldLine}>
                  <Grid spacing={2} container>
                    <Grid item>
                      <Field
                        as={TextField}
                        label={i18n.t("whatsappModal.form.name")}
                        autoFocus
                        name="name"
                        error={touched.name && Boolean(errors.name)}
                        helperText={touched.name && errors.name}
                        variant="outlined"
                        margin="dense"
                        className={classes.textField}
                      />
                    </Grid>
                    <Grid style={{ paddingTop: 15 }} item>
                      <FormControlLabel
                        control={
                          <Field
                            as={Switch}
                            color="primary"
                            name="isDefault"
                            checked={values.isDefault}
                            disabled={values.channel !== "whatsapp"}
                          />
                        }
                        label={i18n.t("whatsappModal.form.default")}
                      />
                    </Grid>
                  </Grid>
                </div>
                <div>
                  <Field
                    as={TextField}
                    select
                    label="Canal"
                    name="channel"
                    fullWidth
                    variant="outlined"
                    margin="dense"
                    disabled={Boolean(whatsAppId)}
                  >
                    <MenuItem value="whatsapp">WhatsApp</MenuItem>
                    {canUseFacebook && (
                      <MenuItem value="facebook">Facebook Messenger</MenuItem>
                    )}
                    {canUseInstagram && (
                      <MenuItem value="instagram">Instagram Direct</MenuItem>
                    )}
                  </Field>
                  {!canUseFacebook && !canUseInstagram && (
                    <Typography variant="caption" color="textSecondary">
                      Facebook e Instagram podem ser liberados no plano da empresa.
                    </Typography>
                  )}
                </div>
                {values.channel === "whatsapp" && (
                  <>
                    <div>
                      <Field
                        as={TextField}
                        select
                        label="Tipo de conexão"
                        name="provider"
                        fullWidth
                        variant="outlined"
                        margin="dense"
                        disabled={Boolean(whatsAppId)}
                      >
                        <MenuItem value="beta">WhatsApp via QR Code</MenuItem>
                        <MenuItem value="notificame">
                          WhatsApp API Oficial
                        </MenuItem>
                      </Field>
                    </div>
                    {values.provider === "notificame" && (
                      <>
                        <Typography variant="caption" color="textSecondary">
                          Conexão oficial via NotificaMe. Não usa QR Code nem sessão no celular.
                        </Typography>
                        <div>
                          <Field
                            as={TextField}
                            label="Token da conta NotificaMe"
                            name="apiToken"
                            type="password"
                            fullWidth
                            variant="outlined"
                            margin="dense"
                            helperText="Token da conta, enviado no cabeçalho X-Api-Token."
                          />
                        </div>
                        <div>
                          <Field
                            as={TextField}
                            label="ID do canal WhatsApp"
                            name="apiChannelId"
                            fullWidth
                            variant="outlined"
                            margin="dense"
                            helperText="Identificador do canal fornecido pela NotificaMe."
                          />
                        </div>
                        {values.apiWebhookSecret && (
                          <div>
                            <TextField
                              label="URL do webhook"
                                value={`${getBackendURL()}/official-whatsapp/notificame/${values.apiWebhookSecret}`}
                              fullWidth
                              variant="outlined"
                              margin="dense"
                              InputProps={{ readOnly: true }}
                              helperText="Cadastre esta URL no webhook do canal NotificaMe."
                            />
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
                {(values.channel === "facebook" ||
                  values.channel === "instagram") && (
                  <>
                    <div>
                      <Field
                        as={TextField}
                        label="Token de verificacao do webhook"
                        name="token"
                        fullWidth
                        variant="outlined"
                        margin="dense"
                        helperText="Use este token na tela de Webhooks da Meta."
                      />
                    </div>
                    <div>
                      <Field
                        as={TextField}
                        label="Access token da Pagina/Instagram"
                        name="tokenMeta"
                        fullWidth
                        variant="outlined"
                        margin="dense"
                        helperText="Token usado para responder mensagens pela API da Meta."
                      />
                    </div>
                    <div>
                      <Field
                        as={TextField}
                        label={
                          values.channel === "instagram"
                            ? "ID da conta Instagram profissional"
                            : "ID da Pagina Facebook"
                        }
                        name="facebookPageUserId"
                        fullWidth
                        variant="outlined"
                        margin="dense"
                        helperText="Deve bater com o recipient.id recebido no webhook."
                      />
                    </div>
                    {values.channel === "instagram" && (
                      <div>
                        <Field
                          as={TextField}
                          label="ID Instagram para envio via graph.instagram.com"
                          name="facebookUserId"
                          fullWidth
                          variant="outlined"
                          margin="dense"
                          helperText="Opcional. Se vazio, o envio usa o endpoint /me/messages da Meta."
                        />
                      </div>
                    )}
                  </>
                )}
                <div>
                  <Field
                    as={TextField}
                    label={i18n.t("queueModal.form.greetingMessage")}
                    type="greetingMessage"
                    multiline
                    rows={4}
                    fullWidth
                    name="greetingMessage"
                    spellCheck={true}
                    error={
                      touched.greetingMessage && Boolean(errors.greetingMessage)
                    }
                    helperText={
                      touched.greetingMessage && errors.greetingMessage
                    }
                    variant="outlined"
                    margin="dense"
                  />
                </div>
                <div>
                  <Typography style={{ fontSize: "11px" }}>
                    {`Variaveis: ( {{ms}}=> Turno, 
                  {{name}}=> Nome do contato, 
                  {{protocol}}=> protocolo, {{hora}}=> hora )`}
                  </Typography>
                </div>
                <div>
                  <Field
                    as={TextField}
                    label={i18n.t("queueModal.form.complationMessage")}
                    type="complationMessage"
                    multiline
                    rows={4}
                    fullWidth
                    name="complationMessage"
                    spellCheck={true}
                    error={
                      touched.complationMessage &&
                      Boolean(errors.complationMessage)
                    }
                    helperText={
                      touched.complationMessage && errors.complationMessage
                    }
                    variant="outlined"
                    margin="dense"
                  />
                </div>
                <div>
                  <Field
                    as={TextField}
                    label={i18n.t("queueModal.form.transferMessage")}
                    type="transferMessage"
                    multiline
                    rows={4}
                    fullWidth
                    name="transferMessage"
                    spellCheck={true}
                    error={
                      touched.transferMessage && Boolean(errors.transferMessage)
                    }
                    helperText={
                      touched.transferMessage && errors.transferMessage
                    }
                    variant="outlined"
                    margin="dense"
                  />
                </div>
                <div>
                  <Field
                    as={TextField}
                    label={i18n.t("queueModal.form.outOfHoursMessage")}
                    type="outOfHoursMessage"
                    multiline
                    rows={4}
                    fullWidth
                    name="outOfHoursMessage"
                    spellCheck={true}
                    error={
                      touched.outOfHoursMessage &&
                      Boolean(errors.outOfHoursMessage)
                    }
                    helperText={
                      touched.outOfHoursMessage && errors.outOfHoursMessage
                    }
                    variant="outlined"
                    margin="dense"
                  />
                </div>
                <div>
                  <Field
                    as={TextField}
                    label={i18n.t("queueModal.form.ratingMessage")}
                    type="ratingMessage"
                    multiline
                    rows={4}
                    fullWidth
                    name="ratingMessage"
                    spellCheck={true}
                    error={
                      touched.ratingMessage && Boolean(errors.ratingMessage)
                    }
                    helperText={touched.ratingMessage && errors.ratingMessage}
                    variant="outlined"
                    margin="dense"
                  />
                </div>
                {values.channel === "whatsapp" && values.provider !== "notificame" && (
                  <div>
                    <Field
                      as={TextField}
                      label={i18n.t("queueModal.form.token")}
                      type="token"
                      fullWidth
                      name="token"
                      variant="outlined"
                      margin="dense"
                    />
                  </div>
                )}
                <QueueSelect
                  selectedQueueIds={selectedQueueIds}
                  onChange={selectedIds => setSelectedQueueIds(selectedIds)}
                />
                <div>
                  <Field
                    as={SelectLanguage}
                    name="language"
                    fullWidth
                    variant="outlined"
                    margin="dense"
                  />
                </div>
              </DialogContent>
              <DialogActions>
                <Button
                  onClick={handleClose}
                  color="secondary"
                  disabled={isSubmitting}
                  variant="outlined"
                >
                  {i18n.t("whatsappModal.buttons.cancel")}
                </Button>
                <Button
                  type="submit"
                  color="primary"
                  disabled={isSubmitting}
                  variant="contained"
                  className={classes.btnWrapper}
                >
                  {whatsAppId
                    ? i18n.t("whatsappModal.buttons.okEdit")
                    : i18n.t("whatsappModal.buttons.okAdd")}
                  {isSubmitting && (
                    <CircularProgress
                      size={24}
                      className={classes.buttonProgress}
                    />
                  )}
                </Button>
              </DialogActions>
            </Form>
          )}
        </Formik>
      </Dialog>
    </div>
  );
};

export default React.memo(WhatsAppModal);
