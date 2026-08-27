import React, { useContext, useEffect, useRef, useState } from "react";

import MenuItem from "@material-ui/core/MenuItem";
import Menu from "@material-ui/core/Menu";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import ConfirmationModal from "../ConfirmationModal";
import TransferTicketModalCustom from "../TransferTicketModalCustom";
import toastError from "../../errors/toastError";
import { Can } from "../Can";
import { AuthContext } from "../../context/Auth/AuthContext";
import { hasUserPermission } from "../../helpers/userPermissions";

import ScheduleModal from "../ScheduleModal";
import TicketParticipantsModal from "../TicketParticipantsModal";
import useSettings from "../../hooks/useSettings";
import { toast } from "react-toastify";

const TicketOptionsMenu = ({
  ticket,
  menuOpen,
  handleClose,
  anchorEl,
  showTabGroups
}) => {
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [transferTicketModalOpen, setTransferTicketModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [participantsModalOpen, setParticipantsModalOpen] = useState(false);
  const [zammadModalOpen, setZammadModalOpen] = useState(false);
  const [zammadEnabled, setZammadEnabled] = useState(false);
  const [zammadTitle, setZammadTitle] = useState("");
  const [zammadSummary, setZammadSummary] = useState("");
  const [zammadGroup, setZammadGroup] = useState("");
  const [zammadPriority, setZammadPriority] = useState("");
  const [zammadIncludeMessages, setZammadIncludeMessages] = useState(true);
  const [creatingZammadTicket, setCreatingZammadTicket] = useState(false);
  const [internalNote, setInternalNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const isMounted = useRef(true);
  const { user } = useContext(AuthContext);
  const { getCachedSetting } = useSettings();

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [contactId, setContactId] = useState(null);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getCachedSetting("zammadEnabled", "false").then(value => {
      if (active) {
        setZammadEnabled(value === "true" || value === "enabled");
      }
    });

    const onSettingsUpdated = event => {
      if (event.detail?.key === "zammadEnabled") {
        setZammadEnabled(
          event.detail.value === "true" || event.detail.value === "enabled"
        );
      }
    };

    window.addEventListener("ticketz-settings-updated", onSettingsUpdated);

    return () => {
      active = false;
      window.removeEventListener("ticketz-settings-updated", onSettingsUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteTicket = async () => {
    try {
      await api.delete(`/tickets/${ticket.id}`);
    } catch (err) {
      toastError(err);
    }
  };

  const handleOpenConfirmationModal = e => {
    setConfirmationOpen(true);
    handleClose();
  };

  const handleOpenTransferModal = e => {
    setTransferTicketModalOpen(true);
    handleClose();
  };

  const handleOpenNoteModal = () => {
    setNoteModalOpen(true);
    handleClose();
  };

  const handleOpenParticipantsModal = () => {
    setParticipantsModalOpen(true);
    handleClose();
  };

  const handleOpenZammadModal = async () => {
    setZammadTitle(`Suporte interno - ${ticket.contact.name}`);
    setZammadSummary("");
    setZammadGroup(await getCachedSetting("zammadGroup", ""));
    setZammadPriority(await getCachedSetting("zammadPriority", "2 normal"));
    setZammadIncludeMessages(true);
    setZammadModalOpen(true);
    handleClose();
  };

  const handleCloseNoteModal = () => {
    setNoteModalOpen(false);
    setInternalNote("");
  };

  const handleSaveInternalNote = async () => {
    if (!internalNote.trim()) return;

    setSavingNote(true);
    try {
      await api.post("/ticket-notes", {
        note: internalNote.trim(),
        ticketId: ticket.id,
        contactId: ticket.contactId || ticket.contact?.id
      });
      handleCloseNoteModal();
    } catch (err) {
      toastError(err);
    }
    setSavingNote(false);
  };

  const handleCreateZammadTicket = async () => {
    if (!zammadTitle.trim() || !zammadSummary.trim()) return;

    setCreatingZammadTicket(true);
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/zammad`, {
        title: zammadTitle.trim(),
        summary: zammadSummary.trim(),
        group: zammadGroup.trim(),
        priority: zammadPriority.trim(),
        includeMessages: zammadIncludeMessages
      });
      toast.success(`Chamado Zammad #${data.number || data.id} aberto`);
      setZammadModalOpen(false);
      if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      toastError(err);
    }
    setCreatingZammadTicket(false);
  };

  const handleCloseTransferTicketModal = () => {
    if (isMounted.current) {
      setTransferTicketModalOpen(false);
    }
  };

  const handleOpenScheduleModal = () => {
    handleClose();
    setContactId(ticket.contact.id);
    setScheduleModalOpen(true);
  };

  const handleCloseScheduleModal = () => {
    setScheduleModalOpen(false);
    setContactId(null);
  };

  return (
    <>
      <Menu
        id="menu-appbar"
        anchorEl={anchorEl}
        getContentAnchorEl={null}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right"
        }}
        keepMounted
        transformOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        open={menuOpen}
        onClose={handleClose}
      >
        <MenuItem onClick={handleOpenScheduleModal}>
          {i18n.t("ticketOptionsMenu.schedule")}
        </MenuItem>
        <MenuItem onClick={handleOpenNoteModal}>Adicionar anotacao</MenuItem>
        {hasUserPermission(user, "ticket-participants:manage") && (
          <MenuItem onClick={handleOpenParticipantsModal}>
            Participantes
          </MenuItem>
        )}
        {zammadEnabled && (
          <MenuItem onClick={handleOpenZammadModal}>Abrir chamado</MenuItem>
        )}
        {(!ticket.isGroup || !showTabGroups || user.profile === "admin") && (
          <MenuItem onClick={handleOpenTransferModal}>
            {i18n.t("ticketOptionsMenu.transfer")}
          </MenuItem>
        )}
        <Can
          role={user.profile}
          permissions={user.permissions}
          perform="ticket-options:deleteTicket"
          yes={() => (
            <MenuItem onClick={handleOpenConfirmationModal}>
              {i18n.t("ticketOptionsMenu.delete")}
            </MenuItem>
          )}
        />
      </Menu>
      <ConfirmationModal
        title={`${i18n.t("ticketOptionsMenu.confirmationModal.title")} #${
          ticket.id
        } ${ticket.contact.name}?`}
        open={confirmationOpen}
        onClose={setConfirmationOpen}
        onConfirm={handleDeleteTicket}
      >
        {i18n.t("ticketOptionsMenu.confirmationModal.message")}
      </ConfirmationModal>
      <Dialog
        open={noteModalOpen}
        onClose={handleCloseNoteModal}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Adicionar anotacao interna</DialogTitle>
        <DialogContent dividers>
          <TextField
            autoFocus
            label="Anotacao"
            placeholder="Resumo, contexto ou combinados importantes"
            value={internalNote}
            onChange={e => setInternalNote(e.target.value)}
            variant="outlined"
            fullWidth
            multiline
            minRows={4}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSaveInternalNote();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseNoteModal}
            color="secondary"
            disabled={savingNote}
            variant="outlined"
          >
            {i18n.t("common.cancel")}
          </Button>
          <Button
            onClick={handleSaveInternalNote}
            color="primary"
            disabled={savingNote || !internalNote.trim()}
            variant="contained"
          >
            {i18n.t("common.save")}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={zammadModalOpen}
        onClose={() => setZammadModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Abrir chamado no Zammad</DialogTitle>
        <DialogContent dividers>
          <TextField
            autoFocus
            label="Titulo"
            value={zammadTitle}
            onChange={e => setZammadTitle(e.target.value)}
            variant="outlined"
            fullWidth
            margin="dense"
          />
          <TextField
            label="Resumo para o tecnico"
            placeholder="Descreva o problema, testes feitos, urgencia e combinados"
            value={zammadSummary}
            onChange={e => setZammadSummary(e.target.value)}
            variant="outlined"
            fullWidth
            multiline
            minRows={4}
            margin="dense"
          />
          <TextField
            label="Grupo"
            value={zammadGroup}
            onChange={e => setZammadGroup(e.target.value)}
            variant="outlined"
            fullWidth
            margin="dense"
            placeholder="Users"
          />
          <TextField
            label="Prioridade"
            value={zammadPriority}
            onChange={e => setZammadPriority(e.target.value)}
            variant="outlined"
            fullWidth
            margin="dense"
            placeholder="2 normal"
          />
          <MenuItem
            selected={zammadIncludeMessages}
            onClick={() => setZammadIncludeMessages(!zammadIncludeMessages)}
          >
            {zammadIncludeMessages
              ? "Incluir ultimas mensagens"
              : "Nao incluir ultimas mensagens"}
          </MenuItem>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setZammadModalOpen(false)}
            color="secondary"
            disabled={creatingZammadTicket}
            variant="outlined"
          >
            {i18n.t("common.cancel")}
          </Button>
          <Button
            onClick={handleCreateZammadTicket}
            color="primary"
            disabled={
              creatingZammadTicket ||
              !zammadTitle.trim() ||
              !zammadSummary.trim()
            }
            variant="contained"
          >
            Abrir chamado
          </Button>
        </DialogActions>
      </Dialog>
      <TransferTicketModalCustom
        modalOpen={transferTicketModalOpen}
        onClose={handleCloseTransferTicketModal}
        ticketid={ticket.id}
        contactId={ticket.contactId || ticket.contact?.id}
        hideUserSelection={showTabGroups && ticket.isGroup}
      />
      <TicketParticipantsModal
        open={participantsModalOpen}
        onClose={() => setParticipantsModalOpen(false)}
        ticket={ticket}
      />
      <ScheduleModal
        open={scheduleModalOpen}
        onClose={handleCloseScheduleModal}
        aria-labelledby="form-dialog-title"
        contactId={contactId}
      />
    </>
  );
};

export default TicketOptionsMenu;
