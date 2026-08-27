import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  makeStyles,
  TextField,
  Typography
} from "@material-ui/core";
import SearchIcon from "@material-ui/icons/Search";
import { format, parseISO } from "date-fns";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
  search: {
    marginBottom: theme.spacing(2)
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1)
  },
  item: {
    padding: theme.spacing(1.25, 1.5),
    borderRadius: 8,
    border: `1px solid ${theme.palette.backgroundContrast.border}`,
    backgroundColor:
      theme.palette.type === "light" ? "#fff" : theme.palette.background.paper
  },
  itemHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: theme.spacing(1),
    marginBottom: theme.spacing(0.75)
  },
  meta: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(0.75),
    alignItems: "center"
  },
  body: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  },
  empty: {
    padding: theme.spacing(4, 2),
    textAlign: "center",
    color: theme.palette.text.secondary
  },
  loading: {
    display: "flex",
    justifyContent: "center",
    padding: theme.spacing(4)
  }
}));

const describeMessage = message => {
  if (message.body) return message.body;
  if (message.mediaType === "audio") return "[Audio]";
  if (message.mediaType === "image") return "[Imagem]";
  if (message.mediaType === "video") return "[Video]";
  if (message.mediaType === "document") return "[Documento]";
  if (message.mediaType === "internalNote") return "[Anotacao interna]";
  return "[Mensagem sem texto]";
};

const ContactMessageHistoryModal = ({ open, onClose, contact }) => {
  const classes = useStyles();
  const [messages, setMessages] = useState([]);
  const [searchParam, setSearchParam] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const contactId = contact?.id;
  const title = useMemo(() => {
    if (!contact?.name && !contact?.number) return "Historico de mensagens";
    return `Historico de mensagens - ${contact.name || contact.number}`;
  }, [contact]);

  useEffect(() => {
    if (!open) {
      setMessages([]);
      setSearchParam("");
      setPageNumber(1);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !contactId) return;

    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/messages/contact/${contactId}/history`, {
          params: {
            pageNumber,
            searchParam
          }
        });

        setMessages(prevMessages =>
          pageNumber === 1 ? data.messages : [...data.messages, ...prevMessages]
        );
        setHasMore(data.hasMore);
      } catch (err) {
        toastError(err);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [contactId, open, pageNumber, searchParam]);

  const handleSearch = event => {
    setSearchParam(event.target.value);
    setPageNumber(1);
  };

  const handleLoadMore = () => {
    setPageNumber(prevPage => prevPage + 1);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          className={classes.search}
          variant="outlined"
          fullWidth
          value={searchParam}
          onChange={handleSearch}
          placeholder="Buscar no historico deste numero"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            )
          }}
        />

        {loading && messages.length === 0 ? (
          <div className={classes.loading}>
            <CircularProgress size={28} />
          </div>
        ) : messages.length === 0 ? (
          <Typography className={classes.empty}>
            Nenhuma mensagem encontrada para este numero.
          </Typography>
        ) : (
          <div className={classes.list}>
            {hasMore && (
              <Button onClick={handleLoadMore} disabled={loading}>
                Carregar mensagens anteriores
              </Button>
            )}
            {messages.map(message => (
              <div
                className={classes.item}
                key={`${message.ticketId}-${message.id}`}
              >
                <div className={classes.itemHeader}>
                  <div className={classes.meta}>
                    <Chip
                      size="small"
                      label={message.fromMe ? "Atendente" : "Cliente"}
                      color={message.fromMe ? "primary" : "default"}
                    />
                    {message.ticket?.queue?.name && (
                      <Chip size="small" label={message.ticket.queue.name} />
                    )}
                    <Typography variant="caption" color="textSecondary">
                      Ticket #{message.ticketId}
                    </Typography>
                  </div>
                  <Typography variant="caption" color="textSecondary">
                    {format(parseISO(message.createdAt), "dd/MM/yyyy HH:mm")}
                  </Typography>
                </div>
                <Typography className={classes.body} variant="body2">
                  {describeMessage(message)}
                </Typography>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Fechar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ContactMessageHistoryModal;
