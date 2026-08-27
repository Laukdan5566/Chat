import React, { useEffect, useMemo, useState } from "react";

import {
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
  formLine: {
    display: "flex",
    gap: theme.spacing(1),
    alignItems: "center",
    marginBottom: theme.spacing(2)
  },
  select: {
    flex: 1
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(1),
    minHeight: 40
  }
}));

const TicketParticipantsModal = ({ open, onClose, ticket }) => {
  const classes = useStyles();
  const [users, setUsers] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !ticket?.id) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [{ data: usersData }, { data: participantsData }] =
          await Promise.all([
            api.get("/users/list"),
            api.get(`/tickets/${ticket.id}/participants`)
          ]);

        setUsers(usersData || []);
        setParticipants(participantsData || []);
      } catch (err) {
        toastError(err);
      }
      setLoading(false);
    };

    loadData();
  }, [open, ticket?.id]);

  const availableUsers = useMemo(() => {
    const participantIds = new Set(participants.map(user => user.id));
    if (ticket?.userId) {
      participantIds.add(ticket.userId);
    }
    return users.filter(user => !participantIds.has(user.id));
  }, [participants, ticket?.userId, users]);

  const handleAdd = async () => {
    if (!selectedUserId) return;

    setSaving(true);
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/participants`, {
        userId: selectedUserId
      });
      setParticipants(data || []);
      setSelectedUserId("");
    } catch (err) {
      toastError(err);
    }
    setSaving(false);
  };

  const handleRemove = async userId => {
    setSaving(true);
    try {
      const { data } = await api.delete(
        `/tickets/${ticket.id}/participants/${userId}`
      );
      setParticipants(data || []);
    } catch (err) {
      toastError(err);
    }
    setSaving(false);
  };

  const handleClose = () => {
    setSelectedUserId("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Participantes do ticket</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <CircularProgress size={24} />
        ) : (
          <>
            <div className={classes.formLine}>
              <FormControl
                variant="outlined"
                margin="dense"
                className={classes.select}
              >
                <InputLabel id="ticket-participant-user-label">
                  Usuário
                </InputLabel>
                <Select
                  label="Usuário"
                  labelId="ticket-participant-user-label"
                  value={selectedUserId}
                  onChange={event => setSelectedUserId(event.target.value)}
                >
                  {availableUsers.map(user => (
                    <MenuItem key={user.id} value={user.id}>
                      {user.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                color="primary"
                variant="contained"
                disabled={!selectedUserId || saving}
                onClick={handleAdd}
              >
                Adicionar
              </Button>
            </div>

            <Typography variant="subtitle2" color="textSecondary" gutterBottom>
              Participantes atuais
            </Typography>
            <div className={classes.chips}>
              {participants.length === 0 && (
                <Typography variant="body2" color="textSecondary">
                  Nenhum participante adicionado.
                </Typography>
              )}
              {participants.map(user => (
                <Chip
                  key={user.id}
                  label={user.name}
                  onDelete={saving ? undefined : () => handleRemove(user.id)}
                  color="primary"
                  variant="outlined"
                />
              ))}
            </div>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary" variant="outlined">
          Fechar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TicketParticipantsModal;
