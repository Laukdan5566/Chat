import React, { useState, useEffect } from "react";

import {
  Avatar,
  CardHeader,
  Dialog,
  DialogContent,
  IconButton
} from "@material-ui/core";
import CloseIcon from "@material-ui/icons/Close";
import { makeStyles } from "@material-ui/core/styles";

import { i18n } from "../../translate/i18n";
import { getInitials } from "../../helpers/getInitials";
import { generateColor } from "../../helpers/colorGenerator";
import api from "../../services/api";

const useStyles = makeStyles(theme => ({
  profileDialogContent: {
    position: "relative",
    padding: theme.spacing(2),
    backgroundColor: "rgba(17, 17, 17, 0.96)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "min(92vw, 560px)",
    height: "min(82vh, 560px)"
  },
  profileDialogClose: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 1,
    color: "#fff",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    "&:hover": {
      backgroundColor: "rgba(0, 0, 0, 0.65)"
    }
  },
  profileImage: {
    display: "block",
    width: "100%",
    height: "100%",
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    borderRadius: 8
  },
  headerAvatar: {
    cursor: "zoom-in"
  }
}));

const TicketInfo = ({ contact, ticket, onClick }) => {
  const classes = useStyles();
  const { user } = ticket;
  const [userName, setUserName] = useState("");
  const [contactName, setContactName] = useState("");
  const [supportNames, setSupportNames] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePicUrl, setProfilePicUrl] = useState(contact?.profilePicUrl);

  useEffect(() => {
    setProfilePicUrl(contact?.profilePicUrl);

    if (contact) {
      setContactName(contact.name);
      if (document.body.offsetWidth < 600) {
        if (contact.name.length > 10) {
          const truncadName = contact.name.substring(0, 10) + "...";
          setContactName(truncadName);
        }
      }
    }

    if (user && contact) {
      setUserName(`${i18n.t("messagesList.header.assignedTo")} ${user.name}`);

      if (document.body.offsetWidth < 600) {
        setUserName(`${user.name}`);
      }
    }

    if (ticket.participants?.length) {
      setSupportNames(
        `Apoio: ${ticket.participants.map(participant => participant.name).join(", ")}`
      );
    } else {
      setSupportNames("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact, user, ticket.participants]);

  const handleAvatarClick = event => {
    event.stopPropagation();

    if (profilePicUrl) {
      setProfileOpen(true);

      api
        .post(`/contacts/${contact.id}/profile-picture`, {
          ticketId: ticket.id,
          whatsappId: ticket.whatsappId
        })
        .then(({ data }) => {
          if (data?.profilePicUrl) {
            setProfilePicUrl(data.profilePicUrl);
          }
        })
        .catch(() => {});
    }
  };

  return (
    <>
      <CardHeader
        onClick={onClick}
        style={{ cursor: "pointer" }}
        titleTypographyProps={{ noWrap: true }}
        subheaderTypographyProps={{ noWrap: true }}
        avatar={
          <Avatar
            className={classes.headerAvatar}
            onClick={handleAvatarClick}
            style={{
              backgroundColor: generateColor(contact?.number),
              color: "white",
              fontWeight: "bold"
            }}
            src={profilePicUrl}
            alt="contact_image"
          >
            {getInitials(contact?.name)}
          </Avatar>
        }
        title={`${contactName} #${ticket.id}`}
        subheader={[ticket.user && userName, supportNames].filter(Boolean).join(" | ")}
      />
      <Dialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        maxWidth={false}
      >
        <DialogContent className={classes.profileDialogContent}>
          <IconButton
            className={classes.profileDialogClose}
            onClick={() => setProfileOpen(false)}
            size="small"
          >
            <CloseIcon />
          </IconButton>
          <img
            className={classes.profileImage}
            src={profilePicUrl}
            alt={contact?.name || "Foto do contato"}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TicketInfo;
