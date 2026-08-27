import React, { useState, useEffect, useMemo } from "react";

import "react-toastify/dist/ReactToastify.css";
import { QueryClient, QueryClientProvider } from "react-query";

import { ptBR } from "@material-ui/core/locale";
import { createTheme, ThemeProvider } from "@material-ui/core/styles";
import { useMediaQuery } from "@material-ui/core";
import ColorModeContext from "./layout/themeContext";
import { PhoneCallProvider } from "./context/PhoneCall/PhoneCallContext";
import { SocketContext, socketManager } from "./context/Socket/SocketContext";
import useSettings from "./hooks/useSettings";
import Favicon from "react-favicon";
import { getBackendURL } from "./services/config";
import { getBrand, getBrandName, resolveBrandName } from "./helpers/brand";

import Routes from "./routes";

const queryClient = new QueryClient();
const defaultBrand = getBrand();
const defaultLogoLight = defaultBrand.logo;
const defaultLogoDark = defaultBrand.logo;
const defaultLogoFavicon = defaultBrand.logo;

function useViewportHeight() {
  useEffect(() => {
    const setVh = () => {
      const h = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty("--vh", `${h}px`);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", setVh);
      window.visualViewport.addEventListener("scroll", setVh);
    }
    window.addEventListener("resize", setVh);

    setVh(); // initial

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", setVh);
        window.visualViewport.removeEventListener("scroll", setVh);
      }
      window.removeEventListener("resize", setVh);
    };
  }, []);
}

const App = () => {
  const [locale, setLocale] = useState();

  const prefersDarkMode = !!window.matchMedia("(prefers-color-scheme: dark)")
    .matches;
  const preferredTheme = window.localStorage.getItem("preferredTheme");
  const [mode, setMode] = useState(
    preferredTheme ? preferredTheme : prefersDarkMode ? "dark" : "light"
  );
  const [primaryColorLight, setPrimaryColorLight] = useState("#888");
  const [primaryColorDark, setPrimaryColorDark] = useState("#888");
  const [appLogoLight, setAppLogoLight] = useState("");
  const [appLogoDark, setAppLogoDark] = useState("");
  const [appLogoFavicon, setAppLogoFavicon] = useState("");
  const [appName, setAppName] = useState("");
  const { getPublicSetting } = useSettings();

  const colorMode = useMemo(
    () => ({
      toggleColorMode: () => {
        setMode(prevMode => (prevMode === "light" ? "dark" : "light"));
      },
      setPrimaryColorLight: color => {
        setPrimaryColorLight(color);
      },
      setPrimaryColorDark: color => {
        setPrimaryColorDark(color);
      },
      setAppLogoLight: file => {
        setAppLogoLight(file);
      },
      setAppLogoDark: file => {
        setAppLogoDark(file);
      },
      setAppLogoFavicon: file => {
        setAppLogoFavicon(file);
      },
      setAppName: name => {
        setAppName(name);
      }
    }),
    []
  );

  const calculatedLogoDark = () => {
    if (appLogoDark === defaultLogoDark && appLogoLight !== defaultLogoLight) {
      return appLogoLight;
    }
    return appLogoDark;
  };
  const calculatedLogoLight = () => {
    if (appLogoDark !== defaultLogoDark && appLogoLight === defaultLogoLight) {
      return appLogoDark;
    }
    return appLogoLight;
  };

  const theme = useMemo(
    () =>
      createTheme(
        {
          scrollbarStyles: {
            "&::-webkit-scrollbar": {
              width: "8px",
              height: "8px"
            },
            "&::-webkit-scrollbar-thumb": {
              boxShadow: "inset 0 0 6px rgba(0, 0, 0, 0.3)",
              backgroundColor:
                mode === "light" ? primaryColorLight : primaryColorDark
            }
          },
          scrollbarStylesSoft: {
            "&::-webkit-scrollbar": {
              width: "8px"
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: mode === "light" ? "#F3F3F3" : "#333333"
            }
          },
            palette: {
              type: mode,
              primary: {
                main: mode === "light" ? primaryColorLight : primaryColorDark
              },
              secondary: {
                main: mode === "light" ? "#0f766e" : "#2dd4bf"
              },
              textPrimary:
                mode === "light" ? primaryColorLight : primaryColorDark,
              textCommon: mode === "light" ? "#000" : "#fff",
              borderPrimary:
                mode === "light" ? primaryColorLight : primaryColorDark,
              background: {
              default: mode === "light" ? "#f6f8fb" : "#111827",
              paper: mode === "light" ? "#fff" : "#1f2937"
            },
            backgroundContrast: {
              default: mode === "light" ? "#eef2f7" : "#263241",
              paper: mode === "light" ? "#e5eaf0" : "#334155",
              border: mode === "light" ? "#d7dee8" : "#334155"
            },
            dark: { main: mode === "light" ? "#333333" : "#666" },
            light: { main: mode === "light" ? "#F3F3F3" : "#333333" },
            chatBubbleFromMe: {
              main: mode === "light" ? "#dcf8c6" : "#005c4b"
            },
            chatBubbleReceived: { main: mode === "light" ? "#fff" : "#024481" },
            chatBackground: { main: mode === "light" ? "#f3f3f3" : "#333" },
            tabHeaderBackground: mode === "light" ? "#eef2f7" : "#1f2937",
            optionsBackground: mode === "light" ? "#f6f8fb" : "#111827",
            options: mode === "light" ? "#f6f8fb" : "#263241",
            fontecor: mode === "light" ? primaryColorLight : primaryColorDark,
            fancyBackground: mode === "light" ? "#f6f8fb" : "#111827",
            bordabox: mode === "light" ? "#e5eaf0" : "#263241",
            newmessagebox: mode === "light" ? "#eef2f7" : "#263241",
            inputdigita: mode === "light" ? "#fff" : "#263241",
            contactdrawer: mode === "light" ? "#fff" : "#1f2937",
            announcements: mode === "light" ? "#eef2f7" : "#1f2937",
            login: mode === "light" ? "#fff" : "#111827",
            announcementspopover: mode === "light" ? "#fff" : "#1f2937",
            chatlist: { main: mode === "light" ? "#e5eaf0" : "#263241" },
            boxlist: mode === "light" ? "#eef2f7" : "#263241",
            boxchatlist: mode === "light" ? "#eef2f7" : "#111827",
            total: mode === "light" ? "#fff" : "#17212b",
            messageIcons: mode === "light" ? "grey" : "#F3F3F3",
            inputBackground: mode === "light" ? "#FFFFFF" : "#263241",
            barraSuperior: mode === "light" ? primaryColorLight : "#666",
            boxticket: mode === "light" ? "#eef2f7" : "#263241",
            campaigntab: mode === "light" ? "#eef2f7" : "#263241",
            ticketzproad: { main: "#39ACE7", contrastText: "white" }
          },
          shape: {
            borderRadius: 10
          },
          typography: {
            fontFamily:
              '"Inter", "Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
            button: {
              fontWeight: 700,
              letterSpacing: 0,
              textTransform: "none"
            }
          },
          props: {
            MuiButton: {
              disableElevation: true
            }
          },
          overrides: {
            MuiButton: {
              root: {
                borderRadius: 8,
                minHeight: 38,
                padding: "8px 16px",
                transition:
                  "background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease"
              },
              contained: {
                boxShadow: "none",
                "&:hover": {
                  boxShadow:
                    mode === "light"
                      ? "0 10px 22px rgba(15, 23, 42, 0.14)"
                      : "0 10px 24px rgba(0, 0, 0, 0.28)",
                  transform: "translateY(-1px)"
                },
                "&:active": {
                  transform: "translateY(0)"
                }
              },
              outlined: {
                borderColor: mode === "light" ? "#d7dee8" : "#334155"
              },
              text: {
                paddingLeft: 12,
                paddingRight: 12
              }
            },
            MuiIconButton: {
              root: {
                borderRadius: 8,
                transition:
                  "background-color 160ms ease, color 160ms ease, transform 160ms ease",
                "&:hover": {
                  transform: "translateY(-1px)"
                }
              }
            },
            MuiPaper: {
              rounded: {
                borderRadius: 10
              },
              elevation1: {
                boxShadow:
                  mode === "light"
                    ? "0 10px 28px rgba(15, 23, 42, 0.08)"
                    : "0 14px 34px rgba(0, 0, 0, 0.28)"
              }
            },
            MuiDialog: {
              paper: {
                borderRadius: 12
              }
            },
            MuiOutlinedInput: {
              root: {
                borderRadius: 8,
                backgroundColor:
                  mode === "light"
                    ? "rgba(255,255,255,0.9)"
                    : "rgba(38,50,65,0.9)",
                transition:
                  "background-color 160ms ease, box-shadow 160ms ease",
                "&:hover $notchedOutline": {
                  borderColor: mode === "light" ? "#9fb1c5" : "#64748b"
                },
                "&$focused": {
                  boxShadow:
                    mode === "light"
                      ? "0 0 0 3px rgba(14, 165, 233, 0.16)"
                      : "0 0 0 3px rgba(45, 212, 191, 0.16)"
                },
                "&$focused $notchedOutline": {
                  borderWidth: 1,
                  borderColor:
                    mode === "light" ? primaryColorLight : primaryColorDark
                }
              },
              notchedOutline: {
                borderColor: mode === "light" ? "#d7dee8" : "#334155"
              },
              input: {
                padding: "14px 14px"
              }
            },
            MuiInputLabel: {
              outlined: {
                transform: "translate(14px, 15px) scale(1)",
                "&$shrink": {
                  transform: "translate(14px, -6px) scale(0.75)"
                }
              }
            },
            MuiTableCell: {
              head: {
                fontWeight: 700,
                backgroundColor: mode === "light" ? "#f8fafc" : "#17212b"
              }
            },
            MuiTab: {
              root: {
                minHeight: 44,
                fontWeight: 700,
                letterSpacing: 0,
                textTransform: "none"
              }
            },
            MuiChip: {
              root: {
                borderRadius: 8,
                fontWeight: 600
              }
            },
            MuiListItem: {
              button: {
                borderRadius: 8,
                margin: "2px 8px",
                width: "calc(100% - 16px)"
              }
            }
          },
          mode,
          appLogoLight,
          appLogoDark,
          appLogoFavicon,
          appName,
          calculatedLogoLight,
          calculatedLogoDark,
          calculatedLogo: () => {
            if (mode === "light") {
              return calculatedLogoLight();
            }
            return calculatedLogoDark();
          }
        },
        locale
      ),
    [
      appLogoLight,
      appLogoDark,
      appLogoFavicon,
      appName,
      locale,
      mode,
      primaryColorDark,
      primaryColorLight
    ]
  );

  useEffect(() => {
    const i18nlocale = localStorage.getItem("language");
    if (!i18nlocale) {
      return;
    }

    const browserLocale =
      i18nlocale.substring(0, 2) + i18nlocale.substring(3, 5);

    if (browserLocale === "ptBR") {
      setLocale(ptBR);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("preferredTheme", mode);
  }, [mode]);

  useEffect(() => {
    getPublicSetting("primaryColorLight")
      .then(color => {
        setPrimaryColorLight(
          defaultBrand.name === "VIB" ? defaultBrand.primary : color || "#0000FF"
        );
      })
      .catch(error => {
        console.log("Error reading setting", error);
      });
    getPublicSetting("primaryColorDark")
      .then(color => {
        setPrimaryColorDark(
          defaultBrand.name === "VIB" ? defaultBrand.primary : color || "#39ACE7"
        );
      })
      .catch(error => {
        console.log("Error reading setting", error);
      });
    getPublicSetting("appLogoLight")
      .then(
        file => {
          setAppLogoLight(
            defaultBrand.name === "VIB"
              ? defaultLogoLight
              : file
                ? `${getBackendURL()}/public/${file}`
                : defaultLogoLight
          );
        },
        _ => {}
      )
      .catch(error => {
        console.log("Error reading setting", error);
      });
    getPublicSetting("appLogoDark")
      .then(file => {
        setAppLogoDark(
          defaultBrand.name === "VIB"
            ? defaultLogoDark
            : file
              ? `${getBackendURL()}/public/${file}`
              : defaultLogoDark
        );
      })
      .catch(error => {
        console.log("Error reading setting", error);
      });
    getPublicSetting("appLogoFavicon")
      .then(file => {
        setAppLogoFavicon(
          defaultBrand.name === "VIB"
            ? defaultLogoFavicon
            : file
              ? `${getBackendURL()}/public/${file}`
              : null
        );
      })
      .catch(error => {
        console.log("Error reading setting", error);
      });
    getPublicSetting("appName")
      .then(name => {
        setAppName(resolveBrandName(name));
      })
      .catch(error => {
        console.log("Error reading setting", error);
        setAppName(getBrandName());
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useViewportHeight();

  return (
    <>
      <Favicon
        url={appLogoFavicon ? theme.appLogoFavicon : defaultLogoFavicon}
      />
      <ColorModeContext.Provider value={{ colorMode }}>
        <PhoneCallProvider>
          <ThemeProvider theme={theme}>
            <QueryClientProvider client={queryClient}>
              <SocketContext.Provider value={socketManager}>
                <Routes />
              </SocketContext.Provider>
            </QueryClientProvider>
          </ThemeProvider>
        </PhoneCallProvider>
      </ColorModeContext.Provider>
    </>
  );
};

export default App;
