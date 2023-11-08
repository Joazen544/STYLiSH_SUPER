import { Request, Response, NextFunction } from "express";
import verifyJWT from "../utils/verifyJWT.js";

async function whoRU(req: Request, res: Response, next: NextFunction) {
  try {
    const tokenInHeaders = req.get("Authorization");
    const token = tokenInHeaders?.replace("Bearer ", "");
    if (!token) {
      //console.log("no token");

      next();
    } else {
      const decoded = await verifyJWT(token);
      res.locals.userId = decoded.userId;
      next();
    }
  } catch (err) {
    if (err instanceof Error) {
      res.status(401).json({ errors: err.message });
      return;
    }
    res.status(401).json({ errors: "authenticate failed" });
    next();
  }
}
export default whoRU;
