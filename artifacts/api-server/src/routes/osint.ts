import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import { getQuakes, getFlights, getNewsEvents, getDisasters } from "../lib/osintFeeds";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/quakes", async (_req, res) => {
  const { data, error } = await getQuakes();
  res.json({ points: data, error });
});

router.get("/flights", async (_req, res) => {
  const { data, error } = await getFlights();
  res.json({ points: data, error });
});

router.get("/news", async (_req, res) => {
  const { data, error } = await getNewsEvents();
  res.json({ points: data, error });
});

router.get("/disasters", async (_req, res) => {
  const { data, error } = await getDisasters();
  res.json({ points: data, error });
});

router.get("/all", async (_req, res) => {
  const [quakes, flights, news, disasters] = await Promise.all([getQuakes(), getFlights(), getNewsEvents(), getDisasters()]);
  const errors = [quakes.error, flights.error, news.error, disasters.error].filter(Boolean);
  if (errors.length) logger.warn({ errors }, "Some OSINT feeds degraded");
  res.json({
    points: [...quakes.data, ...flights.data, ...news.data, ...disasters.data],
    errors: {
      quakes: quakes.error ?? null,
      flights: flights.error ?? null,
      news: news.error ?? null,
      disasters: disasters.error ?? null,
    },
  });
});

export default router;
