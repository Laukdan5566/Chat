import React, { createContext, useMemo, useRef } from "react";

// Lets the composer show a message in the list before the server confirms it.
// The default value is a no-op so MessagesList also works where there is no
// composer (e.g. the "spy" dialog).
const OptimisticMessagesContext = createContext({
  emit: () => {},
  subscribe: () => () => {}
});

const OptimisticMessagesProvider = ({ children }) => {
  const listenersRef = useRef(new Set());

  const value = useMemo(
    () => ({
      emit: event => listenersRef.current.forEach(listener => listener(event)),
      subscribe: listener => {
        listenersRef.current.add(listener);
        return () => listenersRef.current.delete(listener);
      }
    }),
    []
  );

  return (
    <OptimisticMessagesContext.Provider value={value}>
      {children}
    </OptimisticMessagesContext.Provider>
  );
};

export { OptimisticMessagesContext, OptimisticMessagesProvider };
