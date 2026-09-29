import React, { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter, Switch, Route as RouterRoute } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import CircularProgress from "@material-ui/core/CircularProgress";

import LoggedInLayout from "../layout";
import TicketResponsiveContainer from "../pages/TicketResponsiveContainer";
import Login from "../pages/Login/";
import { AuthProvider } from "../context/Auth/AuthContext";
import { TicketsContextProvider } from "../context/Tickets/TicketsContext";
import { WhatsAppsProvider } from "../context/WhatsApp/WhatsAppsContext";
import Route from "./Route";

// Login and the tickets screen are where almost every session starts, so they
// stay in the main bundle; every other page is fetched when first opened.
const Dashboard = lazy(() => import("../pages/Dashboard/"));
const Signup = lazy(() => import("../pages/Signup/"));
const Connections = lazy(() => import("../pages/Connections/"));
const SettingsCustom = lazy(() => import("../pages/SettingsCustom/"));
const Financeiro = lazy(() => import("../pages/Financeiro/"));
const Users = lazy(() => import("../pages/Users"));
const Contacts = lazy(() => import("../pages/Contacts/"));
const Queues = lazy(() => import("../pages/Queues/"));
const Tags = lazy(() => import("../pages/Tags/"));
const MessagesAPI = lazy(() => import("../pages/MessagesAPI/"));
const Helps = lazy(() => import("../pages/Helps/"));
const ContactLists = lazy(() => import("../pages/ContactLists/"));
const ContactListItems = lazy(() => import("../pages/ContactListItems/"));
const QuickMessages = lazy(() => import("../pages/QuickMessages/"));
const Schedules = lazy(() => import("../pages/Schedules"));
const Campaigns = lazy(() => import("../pages/Campaigns"));
const CampaignsConfig = lazy(() => import("../pages/CampaignsConfig"));
const CampaignReport = lazy(() => import("../pages/CampaignReport"));
const Annoucements = lazy(() => import("../pages/Annoucements"));
const Chat = lazy(() => import("../pages/Chat"));
const ToDoList = lazy(() => import("../pages/ToDoList/"));
const Subscription = lazy(() => import("../pages/Subscription/"));
const PublicSalesRouting = lazy(() => import("../pages/PublicSalesRouting"));
const SalesRouting = lazy(() => import("../pages/SalesRouting"));
const WhatsAppStatus = lazy(() => import("../pages/WhatsAppStatus"));

const PageLoading = () => (
  <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
    <CircularProgress size={28} />
  </div>
);

const Routes = () => {
  const [showCampaigns, setShowCampaigns] = useState(false);

  useEffect(() => {
    const cshow = localStorage.getItem("cshow");
    if (cshow !== undefined) {
      setShowCampaigns(true);
    }
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <TicketsContextProvider>
          {/* Switch matches on its direct children's `path`, so the boundary
              wraps the whole Switch; the inner one keeps the sidebar visible
              while a private page loads. */}
          <Suspense fallback={<PageLoading />}>
            <Switch>
              <RouterRoute
                exact
                path="/r/:publicId"
                component={PublicSalesRouting}
              />
              <Route exact path="/login" component={Login} />
              <Route exact path="/signup" component={Signup} />
              {/* <Route exact path="/create-company" component={Companies} /> */}
              <WhatsAppsProvider>
                <LoggedInLayout>
                  <Suspense fallback={<PageLoading />}>
                    <Route
                      exact
                      path="/"
                      component={Dashboard}
                      isPrivate
                      permission="dashboard:view"
                    />
                    <Route
                      exact
                      path="/tickets/:ticketId?"
                      component={TicketResponsiveContainer}
                      isPrivate
                    />
                    <Route
                      exact
                      path="/connections"
                      component={Connections}
                      isPrivate
                      permission="connections:view"
                    />
                    <Route
                      exact
                      path="/quick-messages"
                      component={QuickMessages}
                      isPrivate
                    />
                    <Route
                      exact
                      path="/schedules"
                      component={Schedules}
                      isPrivate
                    />
                    <Route
                      exact
                      path="/todolist"
                      component={ToDoList}
                      isPrivate
                    />
                    <Route exact path="/tags" component={Tags} isPrivate />
                    <Route
                      exact
                      path="/contacts"
                      component={Contacts}
                      isPrivate
                    />
                    <Route exact path="/helps" component={Helps} isPrivate />
                    <Route
                      exact
                      path="/users"
                      component={Users}
                      isPrivate
                      permission="users:view"
                    />
                    <Route
                      exact
                      path="/whatsapp-status"
                      component={WhatsAppStatus}
                      isPrivate
                      permission="connections-page:editOrDeleteConnection"
                    />
                    <Route
                      exact
                      path="/messages-api"
                      component={MessagesAPI}
                      isPrivate
                      permission="messages-api:view"
                    />
                    <Route
                      exact
                      path="/settings"
                      component={SettingsCustom}
                      isPrivate
                      permission="settings:view"
                    />
                    <Route
                      exact
                      path="/financeiro"
                      component={Financeiro}
                      isPrivate
                      permission="financeiro:view"
                    />
                    <Route
                      exact
                      path="/sales-routing"
                      component={SalesRouting}
                      isPrivate
                    />
                    <Route
                      exact
                      path="/queues"
                      component={Queues}
                      isPrivate
                      permission="queues:view"
                    />
                    <Route
                      exact
                      path="/announcements"
                      component={Annoucements}
                      isPrivate
                    />
                    <Route
                      exact
                      path="/subscription"
                      component={Subscription}
                      isPrivate
                    />

                    <Route
                      exact
                      path="/chats/:id?"
                      component={Chat}
                      isPrivate
                    />
                    {showCampaigns && (
                      <>
                        <Route
                          exact
                          path="/contact-lists"
                          component={ContactLists}
                          isPrivate
                          permission="contact-lists:view"
                        />
                        <Route
                          exact
                          path="/contact-lists/:contactListId/contacts"
                          component={ContactListItems}
                          isPrivate
                          permission="contact-lists:view"
                        />
                        <Route
                          exact
                          path="/campaigns"
                          component={Campaigns}
                          isPrivate
                          permission="campaigns:view"
                        />
                        <Route
                          exact
                          path="/campaign/:campaignId/report"
                          component={CampaignReport}
                          isPrivate
                          permission="campaigns:view"
                        />
                        <Route
                          exact
                          path="/campaigns-config"
                          component={CampaignsConfig}
                          isPrivate
                          permission="campaigns-config:view"
                        />
                      </>
                    )}
                  </Suspense>
                </LoggedInLayout>
              </WhatsAppsProvider>
            </Switch>
          </Suspense>
          <ToastContainer autoClose={3000} />
        </TicketsContextProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default Routes;
