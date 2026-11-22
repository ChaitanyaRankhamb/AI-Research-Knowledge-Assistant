"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
} from "react";
import { usePathname } from "next/navigation";
import { getMe, logoutUser } from "@/components/api/authApi";

interface User {
  id: string;
  email: string;
  username: string;
  avatar?: string;
}

interface UserContextType {
  user: User | null;
  isLogged: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLogged, setIsLogged] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const pathname = usePathname();

  const setUserFromResponse = useCallback((response: Awaited<ReturnType<typeof getMe>>) => {
    if (response.success && response.data) {
      setUser(response.data);
      setIsLogged(true);
      return true;
    }
    setIsLogged(false);
    setUser(null);
    return false;
  }, []);

  const handleUserFetchError = useCallback((error: unknown) => {
    console.error("Failed to fetch user:", error);
    setIsLogged(false);
    setUser(null);
    return false;
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      return setUserFromResponse(await getMe());
    } catch (error) {
      return handleUserFetchError(error);
    } finally {
      setIsLoading(false);
    }
  }, [handleUserFetchError, setUserFromResponse]);

  useEffect(() => {
    if (["/login", "/register", "/verify"].includes(pathname)) return;

    let active = true;
    getMe()
      .then((response) => {
        if (active) setUserFromResponse(response);
      })
      .catch((error: unknown) => {
        if (active) handleUserFetchError(error);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [handleUserFetchError, pathname, setUserFromResponse]);

  const login = useCallback(async () => {
    if (!(await fetchUser())) {
      throw new Error("Unable to load your account after login");
    }
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } finally {
      setUser(null);
      setIsLogged(false);
    }
  }, []);

  return (
    <UserContext.Provider value={{ user, isLogged, login, logout, isLoading }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
