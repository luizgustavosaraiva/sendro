export const env = {
  apiUrl: process.env.API_URL ?? "http://localhost:3001",
  appUrl: process.env.DASHBOARD_URL ?? "http://localhost:3000"
};

export const getDashboardOrigin = (request: Request) => new URL(request.url).origin;
