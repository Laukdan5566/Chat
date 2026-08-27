import React, { useState, useEffect, useRef, useContext } from "react";

import { useHistory, useParams } from "react-router-dom";
import { parseISO, format, isSameDay } from "date-fns";
import clsx from "clsx";

import { makeStyles } from "@material-ui/core/styles";
import { green, grey, red, blue } from "@material-ui/core/colors";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemAvatar from "@material-ui/core/ListItemAvatar";
import ListItemSecondaryAction from "@material-ui/core/ListItemSecondaryAction";
import Typography from "@material-ui/core/Typography";
import Avatar from "@material-ui/core/Avatar";
import Divider from "@material-ui/core/Divider";
import Badge from "@material-ui/core/Badge";
import Box from "@material-ui/core/Box";

import { i18n } from "../../translate/i18n";

import api from "../../services/api";
import ButtonWithSpinner from "../ButtonWithSpinner";
import WhatsMarked from "react-whatsmarked";
import { Menu, MenuItem, Tooltip } from "@material-ui/core";
import { AuthContext } from "../../context/Auth/AuthContext";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import toastError from "../../errors/toastError";
import { v4 as uuidv4 } from "uuid";

import RoomIcon from "@material-ui/icons/Room";
import WhatsAppIcon from "@material-ui/icons/WhatsApp";
import AndroidIcon from "@material-ui/icons/Android";
import VisibilityIcon from "@material-ui/icons/Visibility";
import LowPriorityIcon from "@material-ui/icons/LowPriority";
import TicketMessagesDialog from "../TicketMessagesDialog";
import DoneIcon from "@material-ui/icons/Done";
import ClearOutlinedIcon from "@material-ui/icons/ClearOutlined";
import { generateColor } from "../../helpers/colorGenerator";
import { getInitials } from "../../helpers/getInitials";
import pastRelativeDate from "../../helpers/pastRelativeDate";
import TagsLine from "../TagsLine";
import useSettings from "../../hooks/useSettings";

const useStyles = makeStyles(theme => ({
  ticket: {
    position: "relative",
    height: 98,
    paddingHorizontal: 10,
    paddingVertical: 0,
    paddingTop: 0,
    paddingBottom: 0
  },

  pendingTicket: {
    cursor: "unset"
  },

  noTicketsDiv: {
    display: "flex",
    height: "100px",
    margin: 40,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center"
  },

  noTicketsText: {
    textAlign: "center",
    color: "rgb(104, 121, 146)",
    fontSize: "14px",
    lineHeight: "1.4"
  },

  noTicketsTitle: {
    textAlign: "center",
    fontSize: "16px",
    fontWeight: "600",
    margin: "0px"
  },

  contactNameWrapper: {
    display: "grid",
    justifyContent: "space-between"
  },

  lastMessageTime: {
    justifySelf: "flex-end",
    textAlign: "right",
    position: "relative",
    top: -23,
    fontSize: 12
  },

  closedBadge: {
    alignSelf: "center",
    justifySelf: "flex-end",
    marginRight: 32,
    marginLeft: "auto"
  },

  contactLastMessage: {},

  newMessagesCount: {
    alignSelf: "center",
    marginRight: 0,
    marginLeft: "auto",
    top: -10,
    right: 10
  },

  badgeStyle: {
    color: "white",
    backgroundColor: green[500],
    right: 0,
    top: 10
  },

  acceptButton: {
    position: "absolute",
    right: "108px"
  },

  ticketQueueColor: {
    flex: "none",
    width: "8px",
    height: "100%",
    position: "absolute",
    top: "0%",
    left: "0%"
  },

  ticketInfo: {
    position: "relative",
    top: 0
  },

  ticketInfo1: {
    position: "relative",
    top: 40,
    right: 0
  },
  Radiusdot: {
    "& .MuiBadge-badge": {
      borderRadius: 2,
      position: "inherit",
      height: 16,
      margin: 2,
      padding: 3,
      fontSize: 10
    },
    "& .MuiBadge-anchorOriginTopRightRectangle": {
      transform: "scale(1) translate(0%, -40%)"
    }
  },
  presence: {
    color: theme.mode === "light" ? "green" : "lightgreen",
    fontWeight: "bold"
  }
}));

const TicketListItemCustom = ({ ticket, setTabOpen, groupActionButtons }) => {
  const classes = useStyles();
  const history = useHistory();
  const [ticketUser, setTicketUser] = useState(null);
  const [whatsAppName, setWhatsAppName] = useState(null);
  const [spyTicketVisibility, setSpyTicketVisibility] = useState("admin");
  const [queueMenuAnchorEl, setQueueMenuAnchorEl] = useState(null);

  const [openTicketMessageDialog, setOpenTicketMessageDialog] = useState(false);
  const { ticketId } = useParams();
  const isMounted = useRef(true);
  const { setCurrentTicket } = useContext(TicketsContext);
  const { user } = useContext(AuthContext);
  const { profile } = user;
  const { getCachedSetting } = useSettings();
  const userQueues = Array.isArray(user?.queues) ? user.queues : [];

  const canSpyTicket =
    spyTicketVisibility === "all" ||
    (spyTicketVisibility === "admin" && profile === "admin");

  useEffect(() => {
    if (ticket.userId && ticket.user) {
      setTicketUser(ticket.user.name);
    }

    if (ticket.whatsappId && ticket.whatsapp) {
      setWhatsAppName(ticket.whatsapp.name);
    }

    return () => {
      isMounted.current = false;
    };
  }, [ticket]);

  useEffect(() => {
    let active = true;
    getCachedSetting("spyTicketVisibility", "admin").then(value => {
      if (active) {
        setSpyTicketVisibility(value || "admin");
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCloseTicket = async id => {
    try {
      await api.put(`/tickets/${id}`, {
        status: "closed",
        justClose: true,
        userId: user?.id
      });
    } catch (err) {
      toastError(err);
    }
    history.push(`/tickets/`);
  };

  const handleAcceptTicket = async (id, queueId) => {
    try {
      const ticketData = {
        status: "open",
        userId: user?.id
      };

      if (queueId) {
        ticketData.queueId = queueId;
      }

      const { data: acceptedTicket } = await api.put(`/tickets/${id}`, ticketData);
      const acceptedTicketUuid = acceptedTicket?.uuid || ticket.uuid;

      // The pending-list item is a stale snapshot. Use the API response so the
      // conversation opens with the UUID and ownership produced by the accept.
      handleSelectTicket({ ...ticket, ...acceptedTicket });

      setTabOpen("open");

      if (acceptedTicketUuid) {
        const ticketPath = `/tickets/${acceptedTicketUuid}`;

        // TicketsCustom renders its conversation pane from the URL, while the
        // responsive view uses TicketsContext. Update both views immediately.
        history.replace(ticketPath);

        // Some desktop sessions keep the previous pane after a status switch.
        // If it did not mount, reload that same ticket instead of making the
        // agent find it manually or press F5.
        window.setTimeout(() => {
          if (
            window.location.pathname !== ticketPath ||
            !document.getElementById("drawer-container")
          ) {
            window.location.assign(ticketPath);
          }
        }, 1200);
      }
    } catch (err) {
      toastError(err);
      return;
    }
  };

  const handleOpenQueueMenu = e => {
    e.stopPropagation();
    setQueueMenuAnchorEl(e.currentTarget);
  };

  const handleCloseQueueMenu = e => {
    e?.stopPropagation();
    setQueueMenuAnchorEl(null);
  };

  const handleSelectTicket = ticket => {
    const code = uuidv4();
    const { id, uuid } = ticket;
    setCurrentTicket({ id, uuid, code });
  };

  const renderTicketInfo = () => {
    if (ticketUser && ticket.status !== "pending") {
      return (
        <>
          <Badge
            className={classes.Radiusdot}
            badgeContent={`${ticketUser}`}
            //color="primary"
            style={{
              backgroundColor: "#3498db",
              height: 18,
              padding: 5,
              position: "inherit",
              borderRadius: 7,
              color: "#fff",
              top: -6,
              marginRight: 3
            }}
          />

          {ticket.whatsappId && (
            <Badge
              className={classes.Radiusdot}
              badgeContent={`${whatsAppName}`}
              style={{
                backgroundColor: "#7d79f2",
                height: 18,
                padding: 5,
                position: "inherit",
                borderRadius: 7,
                color: "white",
                top: -6,
                marginRight: 3
              }}
            />
          )}

          {ticket.queue?.name !== null && (
            <Badge
              className={classes.Radiusdot}
              style={{
                backgroundColor: ticket.queue?.color || "#7C7C7C",
                height: 18,
                padding: 5,
                position: "inherit",
                borderRadius: 7,
                color: "white",
                top: -6,
                marginRight: 3
              }}
              badgeContent={ticket.queue?.name || "Sem fila"}
              //color="primary"
            />
          )}
          {ticket.status === "open" && (
            <Tooltip title="Fechar Conversa">
              <ClearOutlinedIcon
                onClick={() => handleCloseTicket(ticket.id)}
                fontSize="small"
                style={{
                  color: "#fff",
                  backgroundColor: red[700],
                  cursor: "pointer",
                  //margin: '0 5 0 5',
                  padding: 2,
                  height: 23,
                  width: 23,
                  fontSize: 12,
                  borderRadius: 50,
                  position: "absolute",
                  right: 0,
                  top: -8
                }}
              />
            </Tooltip>
          )}
          {canSpyTicket && (
            <Tooltip title="Espiar Conversa">
              <VisibilityIcon
                onClick={e => {
                  e.stopPropagation();
                  setOpenTicketMessageDialog(true);
                }}
                fontSize="small"
                style={{
                  padding: 2,
                  height: 23,
                  width: 23,
                  fontSize: 12,
                  color: "#fff",
                  cursor: "pointer",
                  backgroundColor: blue[700],
                  borderRadius: 50,
                  position: "absolute",
                  right: 28,
                  top: -8
                }}
              />
            </Tooltip>
          )}
          {ticket.chatbot && (
            <Tooltip title="Chatbot">
              <AndroidIcon
                fontSize="small"
                style={{ color: grey[700], marginRight: 5 }}
              />
            </Tooltip>
          )}
        </>
      );
    } else {
      return (
        <>
          {ticket.whatsappId && (
            <Badge
              className={classes.Radiusdot}
              badgeContent={`${whatsAppName}`}
              style={{
                backgroundColor: "#7d79f2",
                height: 18,
                padding: 5,
                position: "inherit",
                borderRadius: 7,
                color: "white",
                top: -6,
                marginRight: 3
              }}
            />
          )}

          {ticket.queue?.name !== null && (
            <Badge
              className={classes.Radiusdot}
              style={{
                backgroundColor: ticket.queue?.color || "#7C7C7C",
                height: 18,
                padding: 5,
                paddingHorizontal: 12,
                position: "inherit",
                borderRadius: 7,
                color: "white",
                top: -6,
                marginRight: 2
              }}
              badgeContent={ticket.queue?.name || "Sem fila"}
              //color=
            />
          )}
          {ticket.status === "pending" &&
            (groupActionButtons || !ticket.isGroup) && (
              <Tooltip title="Fechar Conversa">
                <ClearOutlinedIcon
                  onClick={() => handleCloseTicket(ticket.id)}
                  fontSize="small"
                  style={{
                    color: "#fff",
                    backgroundColor: red[700],
                    cursor: "pointer",
                    margin: "0 5 0 5",
                    padding: 2,
                    right: 48,
                    height: 23,
                    width: 23,
                    fontSize: 12,
                    borderRadius: 50,
                    top: -8,
                    position: "absolute"
                  }}
                />
              </Tooltip>
            )}
          {ticket.status === "pending" &&
            (groupActionButtons || !ticket.isGroup) &&
            userQueues.length > 0 && (
              <Tooltip title="Aceitar em uma fila">
                <LowPriorityIcon
                  onClick={handleOpenQueueMenu}
                  fontSize="small"
                  style={{
                    color: "#fff",
                    backgroundColor: "#f9a825",
                    cursor: "pointer",
                    padding: 2,
                    right: 73,
                    height: 23,
                    width: 23,
                    fontSize: 12,
                    borderRadius: 50,
                    top: -8,
                    position: "absolute"
                  }}
                />
              </Tooltip>
            )}
          {ticket.chatbot && (
            <Tooltip title="Chatbot">
              <AndroidIcon
                fontSize="small"
                style={{ color: grey[700], marginRight: 5 }}
              />
            </Tooltip>
          )}
          {ticket.status === "open" &&
            (groupActionButtons || !ticket.isGroup) && (
              <Tooltip title="Fechar Conversa">
                <ClearOutlinedIcon
                  onClick={() => handleCloseTicket(ticket.id)}
                  fontSize="small"
                  style={{
                    color: red[700],
                    cursor: "pointer",
                    marginRight: 5,
                    right: 49,
                    top: -8,
                    position: "absolute"
                  }}
                />
              </Tooltip>
            )}
          {ticket.status === "pending" &&
            (groupActionButtons || !ticket.isGroup) && (
              <Tooltip title="Aceitar Conversa">
                <DoneIcon
                  onClick={() => handleAcceptTicket(ticket.id)}
                  fontSize="small"
                  style={{
                    color: "#fff",
                    backgroundColor: green[700],
                    cursor: "pointer",
                    //margin: '0 5 0 5',
                    padding: 2,
                    height: 23,
                    width: 23,
                    fontSize: 12,
                    borderRadius: 50,
                    right: 25,
                    top: -8,
                    position: "absolute"
                  }}
                />
              </Tooltip>
            )}

          {canSpyTicket && (groupActionButtons || !ticket.isGroup) && (
            <Tooltip title="Espiar Conversa">
              <VisibilityIcon
                onClick={e => {
                  e.stopPropagation();
                  setOpenTicketMessageDialog(true);
                }}
                fontSize="small"
                style={{
                  padding: 2,
                  height: 23,
                  width: 23,
                  fontSize: 12,
                  color: "#fff",
                  cursor: "pointer",
                  backgroundColor: blue[700],
                  borderRadius: 50,
                  right: 0,
                  top: -8,
                  position: "absolute"
                }}
              />
            </Tooltip>
          )}
        </>
      );
    }
  };

  return (
    <div key={`ticket-${ticket.id}`} className={classes.ticketContainer}>
      <TicketMessagesDialog
        open={openTicketMessageDialog}
        handleClose={() => setOpenTicketMessageDialog(false)}
        ticketId={ticket.id}
      ></TicketMessagesDialog>
      <Menu
        anchorEl={queueMenuAnchorEl}
        open={Boolean(queueMenuAnchorEl)}
        onClose={handleCloseQueueMenu}
        onClick={e => e.stopPropagation()}
      >
        {userQueues.map(queue => (
          <MenuItem
            key={queue.id}
            onClick={e => {
              e.stopPropagation();
              handleCloseQueueMenu(e);
              handleAcceptTicket(ticket.id, queue.id);
            }}
          >
            {queue.name}
          </MenuItem>
        ))}
      </Menu>
      <ListItem
        dense
        button
        onClick={e => {
          if (
            (groupActionButtons || !ticket.isGroup) &&
            ticket.status === "pending"
          )
            return;
          handleSelectTicket(ticket);
        }}
        selected={ticketId && +ticketId === ticket.id}
        className={clsx(classes.ticket, {
          [classes.pendingTicket]: ticket.status === "pending"
        })}
      >
        <Tooltip
          arrow
          placement="right"
          title={ticket.queue?.name || "Sem fila"}
        >
          <span
            style={{ backgroundColor: ticket.queue?.color || "#7C7C7C" }}
            className={classes.ticketQueueColor}
          ></span>
        </Tooltip>
        <ListItemAvatar>
          <Avatar
            style={{
              backgroundColor: generateColor(ticket?.contact?.number),
              color: "white",
              fontWeight: "bold"
            }}
            src={ticket?.contact?.profilePicUrl}
          >
            {getInitials(ticket?.contact?.name || "")}
          </Avatar>
        </ListItemAvatar>
        <ListItemText
          style={{ paddingBottom: 10 }}
          disableTypography
          primary={
            <span className={classes.contactNameWrapper}>
              <Typography
                noWrap
                component="span"
                variant="body2"
                color="textPrimary"
              >
                {ticket.channel === "whatsapp" && (
                  <Tooltip title={`Atribuido à ${ticketUser}`}>
                    <WhatsAppIcon
                      fontSize="inherit"
                      style={{ color: grey[700] }}
                    />
                  </Tooltip>
                )}{" "}
                {ticket.contact.name}
              </Typography>
            </span>
          }
          secondary={
            <span className={classes.contactNameWrapper}>
              <Typography
                className={classes.contactLastMessage}
                noWrap
                component="span"
                variant="body2"
                color="textSecondary"
              >
                {["composing", "recording"].includes(ticket?.presence) ? (
                  <span className={classes.presence}>
                    {i18n.t(`presence.${ticket.presence}`)}
                  </span>
                ) : (
                  <>
                    {ticket.lastMessage?.includes("data:image/png;base64") ? (
                      <div>Localização</div>
                    ) : (
                      <WhatsMarked oneline>
                        {ticket.lastMessage.startsWith('{"ticketzvCard"')
                          ? "🪪"
                          : ticket.lastMessage.split("\n")[0]}
                      </WhatsMarked>
                    )}
                  </>
                )}
              </Typography>
              <TagsLine ticket={ticket} />
              <ListItemSecondaryAction style={{ left: 73 }}>
                <Box className={classes.ticketInfo1}>{renderTicketInfo()}</Box>
              </ListItemSecondaryAction>
            </span>
          }
        />
        <ListItemSecondaryAction style={{}}>
          {ticket.status === "closed" && (
            <Badge
              className={classes.Radiusdot}
              badgeContent={i18n.t("common.closed")}
              //color="primary"
              style={{
                backgroundColor: ticket.queue?.color || "#ff0000",
                height: 18,
                padding: 5,
                paddingHorizontal: 12,
                borderRadius: 7,
                color: "white",
                top: -28,
                marginRight: 5
              }}
            />
          )}

          {ticket.lastMessage && (
            <>
              <Typography
                className={classes.lastMessageTime}
                component="span"
                variant="body2"
                color="textSecondary"
              >
                {pastRelativeDate(parseISO(ticket.updatedAt))}
              </Typography>

              <Badge
                className={classes.newMessagesCount}
                badgeContent={
                  ticket.unreadMessages ? ticket.unreadMessages : null
                }
                classes={{
                  badge: classes.badgeStyle
                }}
              />
              <br />
            </>
          )}
        </ListItemSecondaryAction>
      </ListItem>
      <Divider variant="inset" component="li" />
    </div>
  );
};

export default TicketListItemCustom;
