import { useEffect, useState } from "react";
import Login from "@/pages/Login";
import { Loading } from "@/components/app-ui";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query-client";

export default function AuthGuard({ children }) {
  const [signedIn, setSignedIn] = useState(null);
  useEffect(() => {
    let active = true;
    api("session")
      .then((data) => {
        if (active) setSignedIn(data.authenticated);
      })
      .catch(() => {
        if (active) setSignedIn(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (signedIn === null) return <Loading />;
  if (!signedIn) return <Login onLogin={() => setSignedIn(true)} />;
  return children(() => {
    queryClient.clear();
    setSignedIn(false);
  });
}
