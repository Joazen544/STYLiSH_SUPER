import * as cache from "../utils/cache.js";
import { product, campaign } from "../schema/schema.js";
const CACHE_KEY = cache.getCampaignKey();
//
export async function getCampaigns(req, res) {
    try {
        // Check cache first
        const cachedCampaigns = await cache.get(CACHE_KEY);
        if (cachedCampaigns) {
            // const campaigns = z
            //   .array(campaignModel.CampaignSchema)
            //   .parse(JSON.parse(cachedCampaigns));
            const campaigns = JSON.parse(cachedCampaigns);
            res.status(200).json({
                data: campaigns,
            });
            return;
        }
        // Get campaign from DB
        const campaigns = await campaign.find();
        await cache.set(CACHE_KEY, JSON.stringify(campaigns));
        res.status(200).json({
            data: campaigns,
        });
    }
    catch (err) {
        if (err instanceof Error) {
            res.status(500).json({ errors: err.message });
            return;
        }
        res.status(500).json({ errors: "get campaigns failed" });
    }
}
export async function checkProductExist(req, res, next) {
    const { productId } = req.body;
    if (await product.findById(productId)) {
        next();
        return;
    }
    res.status(400).json({ errors: "product not existed" });
    return;
}
export async function createCampaign(req, res) {
    try {
        const { productId, story } = req.body;
        if (!req.file?.filename)
            throw new Error("no picture");
        const { filename } = req.file;
        const campaignId = await campaign.create({
            product_id: productId,
            story: story,
            picture: `/uploads/${filename}`,
        });
        await cache.del(CACHE_KEY);
        res.status(200).json({ data: campaignId });
    }
    catch (err) {
        if (err instanceof Error) {
            res.status(500).json({ errors: err.message });
            return;
        }
        res.status(500).json({ errors: "create campaigns failed" });
    }
}
