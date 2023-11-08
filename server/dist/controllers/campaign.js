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
const DOMAIN_NAME = process.env.DOMAIN_NAME;
function resp(productsData) {
    const [resData] = productsData.map((i) => {
        // console.log(i.size);
        const copyArr = i.size;
        const changeSizes = [...copyArr];
        // console.log(changeSizes);
        const colorsSet = new Set();
        const sizesSet = new Set();
        i.color.forEach((color, index) => {
            colorsSet.add(JSON.stringify({ code: color, name: i.colorName[index] }));
            sizesSet.add(i.size[index]);
        });
        const colors = Array.from(colorsSet).map((colorString) => JSON.parse(colorString));
        const sizes = Array.from(sizesSet).map((size) => size);
        const customSizeOrder = ["XS", "S", "M", "L", "XL"];
        sizes.sort((a, b) => {
            return customSizeOrder.indexOf(a) - customSizeOrder.indexOf(b);
        });
        const variants = [];
        i.color.forEach((color, index) => {
            variants.push({
                color_code: color,
                size: changeSizes[index],
                stock: i.stock[index],
            });
        });
        const copyImg = i.images;
        const changeImg = [...copyImg];
        changeImg.shift();
        return {
            id: i._id,
            category: i.category,
            tags: i.tags,
            title: i.title,
            description: i.description,
            price: i.price,
            texture: i.texture,
            wash: i.wash,
            place: i.place,
            note: i.note,
            story: i.story,
            colors,
            sizes,
            variants,
            main_image: i.main_image,
            images: changeImg,
        };
    });
    return resData;
}
export async function getHots(req, res) {
    try {
        const hotCasuals = await product.find({ tags: { $regex: /Casual/ } });
        const hotFormals = await product.find({ tags: { $regex: /Formal/ } });
        const hot89 = await product.find({ tags: { $regex: /89/ } });
        hotCasuals.forEach((pd, index) => {
            pd.main_image = DOMAIN_NAME + pd.main_image;
            pd.images.forEach((image, ind) => {
                pd.images[ind] = DOMAIN_NAME + pd.images[ind];
            });
        });
        // console.log(hotCasuals)
        hotFormals.forEach((pd, index) => {
            pd.main_image = DOMAIN_NAME + pd.main_image;
            pd.images.forEach((image, ind) => {
                pd.images[ind] = DOMAIN_NAME + pd.images[ind];
            });
        });
        hot89.forEach((pd, index) => {
            pd.main_image = DOMAIN_NAME + pd.main_image;
            pd.images.forEach((image, ind) => {
                pd.images[ind] = DOMAIN_NAME + pd.images[ind];
            });
        });
        // 資料轉換並且放入 data array
        const data = [];
        const casualTags = { title: "casual", products: [] };
        const formattedCasuals = resp(hotCasuals);
        casualTags.products.push(formattedCasuals);
        const formalTags = { title: "formal", products: [] };
        const formattedFormals = resp(hotFormals);
        formalTags.products.push(formattedFormals);
        const eightNineTags = { title: "89", products: [] };
        const formatted89 = resp(hot89);
        eightNineTags.products.push(formatted89);
        data.push(casualTags);
        data.push(formalTags);
        data.push(eightNineTags);
        res.status(200).json({ data });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ errors: "Get hots failed" });
    }
}
