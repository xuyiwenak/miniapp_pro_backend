import { Router, type Response } from "express";
import path from "path";
import { sendSucc, sendErr } from "../../../../shared/miniapp/middleware/response";
import type { MiniappRequest } from "../../../../shared/miniapp/middleware/auth";
import { signOssUrl } from "../../../../util/ossUploader";

const router = Router();

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

router.get("/temp-url", async (req: MiniappRequest, res: Response) => {
  const objectKey = (req.query?.objectKey as string | undefined)?.trim();

  if (!objectKey) {
    sendErr(res, "Missing objectKey", 400);
    return;
  }

  const ext = path.extname(objectKey).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    sendErr(res, "Only image files are allowed", 400);
    return;
  }

  try {
    const url = signOssUrl(objectKey);
    sendSucc(res, { url });
  } catch (err) {
    sendErr(res, "Failed to generate signed URL", 500);
  }
});

export default router;
