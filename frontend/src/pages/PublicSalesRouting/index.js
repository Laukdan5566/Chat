import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Typography
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import { openApi } from "../../services/api";

const useStyles = makeStyles(theme => ({
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    background: theme.palette.type === "dark" ? "#111827" : "#f3f6fb"
  },
  card: {
    padding: theme.spacing(4),
    maxWidth: 520,
    margin: "0 auto",
    borderRadius: 8
  },
  actions: {
    display: "grid",
    gap: theme.spacing(1.5),
    marginTop: theme.spacing(3)
  }
}));

const PublicSalesRouting = () => {
  const { publicId } = useParams();
  const classes = useStyles();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    openApi
      .get(`/sales-routing-link/${publicId}`)
      .then(response => {
        if (active) setData(response.data);
      })
      .catch(() => {
        if (active) setError("Este link de atendimento n\u00e3o est\u00e1 dispon\u00edvel.");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [publicId]);

  const select = async (kind, consultantId) => {
    setSending(true);
    setError("");
    try {
      const response = await openApi.post(`/sales-routing-link/${publicId}/select`, {
        kind,
        consultantId
      });
      window.location.assign(response.data.whatsappUrl);
    } catch (_) {
      setError("N\u00e3o foi poss\u00edvel iniciar o atendimento. Tente novamente.");
      setSending(false);
    }
  };

  return (
    <div className={classes.page}>
      <Container maxWidth="sm">
        <Paper elevation={3} className={classes.card}>
          {loading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <Typography variant="h5" gutterBottom>
                {data?.title || "Atendimento"}
              </Typography>
              <Typography color="textSecondary">
                Você já tem uma consultora que acompanha seu atendimento?
              </Typography>
              <div className={classes.actions}>
                <Button
                  variant="contained"
                  color="primary"
                  disabled={sending}
                  onClick={() => select("new")}
                >
                  Não, quero um novo atendimento
                </Button>
                {(data?.consultants || []).map(consultant => (
                  <Button
                    key={consultant.id}
                    variant="outlined"
                    color="primary"
                    disabled={sending}
                    onClick={() => select("consultant", consultant.id)}
                  >
                    Já sou cliente de {consultant.label}
                  </Button>
                ))}
              </div>
              {error && (
                <Typography color="error" style={{ marginTop: 20 }}>
                  {error}
                </Typography>
              )}
            </>
          )}
        </Paper>
      </Container>
    </div>
  );
};

export default PublicSalesRouting;
