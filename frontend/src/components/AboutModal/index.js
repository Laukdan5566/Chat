import React from "react";

import { makeStyles } from "@material-ui/core/styles";
import {
  Button,
  Dialog,
  Typography,
  DialogActions,
  DialogContent,
  DialogTitle
} from "@material-ui/core";

import { useTheme } from "@material-ui/core/styles";
import { i18n } from "../../translate/i18n";

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
  logoImg: {
    width: "100%",
    margin: "0 auto",
    content: `url("${theme.calculatedLogo()}")`
  },
  textCenter: {
    textAlign: "center"
  }
}));

const AboutModal = ({ open, onClose }) => {
  const classes = useStyles();
  const theme = useTheme();

  const handleClose = () => {
    onClose();
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
        <DialogTitle id="form-dialog-title">
          {i18n.t("about.aboutthe")}{" "}
          {theme.appName}
        </DialogTitle>
        <DialogContent dividers>
          <div>
            <img className={classes.logoImg} alt={theme.appName} />
          </div>
          <Typography className={classes.textCenter}>
            {theme.appName}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleClose}
            type="submit"
            color="primary"
            variant="contained"
          >
            {i18n.t("about.buttonclose")}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default AboutModal;
