import { makeStyles } from "@material-ui/core";

export const useStyles = makeStyles(theme => ({
  menuPaper: {
    minWidth: 230,
    borderRadius: 10
  },
  emojiButton: {
    cursor: "pointer",
    borderRadius: "50%",
    width: 34,
    height: 34,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.3rem",
    transition: "transform 0.1s ease-in-out",
    "&:hover": {
      backgroundColor: "#888a",
      transform: "scale(1.15)"
    }
  },
  flexContainer: {
    display: "flex",
    flexWrap: "nowrap",
    justifyContent: "space-between",
    padding: "2px 8px 6px",
    marginBottom: 4,
    borderBottom: `1px solid ${theme.palette.divider}`
  },
  menuIcon: {
    minWidth: 36
  },
  dangerItem: {
    color: theme.palette.error.main,
    "& $menuIcon": {
      color: theme.palette.error.main
    }
  }
}));
