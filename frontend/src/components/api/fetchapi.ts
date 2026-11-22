export const AUTH_API_BASE_URL =
  process.env.NEXT_PUBLIC_AUTH_API_URL || "http://localhost:8000";
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || AUTH_API_BASE_URL;

let refreshPromise: Promise<boolean> | null = null;

const isPublicRequest = (url: string) => {
  let pathname: string;
  try {
    pathname = new URL(url, AUTH_API_BASE_URL).pathname;
  } catch {
    return false;
  }

  return (
    pathname === "/auth/login" ||
    pathname === "/auth/register" ||
    pathname === "/auth/refresh" ||
    pathname === "/verify" ||
    pathname.startsWith("/verify/") ||
    pathname === "/check-username" ||
    pathname === "/"
  );
};

const refreshSession = async () => {
  if (!refreshPromise) {
    refreshPromise = fetch(`${AUTH_API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((response) => {
        if (response.status === 401) return false;
        if (!response.ok) {
          throw new Error(`Session refresh failed (${response.status})`);
        }
        return true;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

const redirectToLogin = () => {
  if (
    typeof window === "undefined" ||
    ["/login", "/register", "/verify"].includes(window.location.pathname)
  ) {
    return;
  }

  window.location.assign(
    new URL("/login", window.location.origin).toString(),
  );
};

export const fetchapi = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  const request = new Request(url, {
    ...options,
    credentials: "include",
  });
  let response = await fetch(request.clone());

  if (response.status !== 401 || isPublicRequest(url)) {
    return response;
  }

  const refreshed = await refreshSession();
  if (!refreshed) {
    redirectToLogin();
    return response;
  }

  response = await fetch(request.clone());
  if (response.status === 401) {
    redirectToLogin();
  }
  return response;
};
