import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import { fileTypeFromBuffer } from "file-type";
import { product } from "../schema/schema.js";
import { Redis } from "ioredis";
import { uploadProductsToElasticSearch, searchHotProducts, addClickToElasticSearch, } from "../models/elasticsearch.js";
// import dotenv from "dotenv";
// dotenv.config();
export const redis = new Redis({
    host: process.env.REDIS_HOST,
    password: process.env.REDIS_PASSWORD,
    // commandTimeout: 300,
});
const DOMAIN_NAME = process.env.DOMAIN_NAME;
function resp(productsData, next_paging = -1) {
    const resData = {
        data: productsData.map((i) => {
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
        }),
        next_paging,
    };
    if (next_paging === null || next_paging === -1) {
        delete resData.next_paging;
    }
    return resData;
}
export async function getProducts(req, res) {
    try {
        const paging = Number(req.query.paging) || 0;
        const category = req.params.category;
        const PAGE_COUNT = 7;
        const PAGE_SKIP = 6;
        if (category === "all") {
            const productsData = await product
                .find()
                .skip(paging * PAGE_SKIP)
                .limit(PAGE_COUNT);
            // console.log(paging);
            let next_paging = paging + 1;
            if (productsData.length > 6) {
                productsData.pop();
            }
            else {
                next_paging = null;
            }
            // console.log(JSON.stringify(productsData, null, 4));
            productsData.forEach((pd, index) => {
                pd.main_image = DOMAIN_NAME + pd.main_image;
                pd.images.forEach((image, ind) => {
                    pd.images[ind] = DOMAIN_NAME + pd.images[ind];
                });
            });
            const resData = resp(productsData, next_paging);
            return res.json(resData);
        }
        const productsData = await product
            .find({ category })
            .skip(paging * PAGE_SKIP)
            .limit(PAGE_COUNT);
        let next_paging = paging + 1;
        if (productsData.length > 6) {
            productsData.pop();
        }
        else {
            next_paging = null;
        }
        // console.log(JSON.stringify(productsData, null, 4));
        productsData.forEach((pd, index) => {
            pd.main_image = DOMAIN_NAME + pd.main_image;
            pd.images.forEach((image, ind) => {
                pd.images[ind] = DOMAIN_NAME + pd.images[ind];
            });
        });
        const resData = resp(productsData, next_paging);
        res.json(resData);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ data: [] });
    }
}
export async function getProduct(req, res) {
    try {
        const id = String(req.query.id);
        // Update click
        const productData = await product.findOneAndUpdate({ _id: id }, { $inc: { click: 1 } }, { new: true });
        try {
            addClickToElasticSearch(id);
        }
        catch (err) {
            console.log("something goes wrong adding click to elastic");
            console.log(err);
        }
        // Update history
        const userId = res.locals.userId;
        if (userId) {
            const queueKey = `${userId}BrowsingHistory`;
            const sortedSetKey = `${userId}BrowsingHistoryCounter`;
            const maxQueueSize = 10;
            const tags = productData?.tags;
            tags?.forEach(async (tag) => {
                await redis.lpush(queueKey, tag);
                await redis.zincrby(sortedSetKey, 1, tag);
                // Check queue length
                const queueLength = await redis.llen(queueKey);
                if (queueLength > maxQueueSize) {
                    const removedtag = (await redis.rpop(queueKey));
                    await redis.zincrby(sortedSetKey, -1, removedtag);
                }
            });
        }
        if (productData) {
            productData.main_image = DOMAIN_NAME + productData.main_image;
            productData.images.forEach((image, index) => {
                productData.images[index] = DOMAIN_NAME + productData.images[index];
            });
        }
        const resData = resp([productData]);
        res.json(resData);
    }
    catch (err) {
        console.error(err);
        if (err instanceof Error) {
            res.status(500).json({ errors: err.message });
            return;
        }
        return res.status(500).json({ errors: "get products failed" });
    }
}
export async function searchProducts(req, res) {
    try {
        const { productIds } = req.body;
        const paging = Number(req.query.paging) || 0;
        const productsData = await product.find({
            _id: { $in: productIds },
        });
        console.log(productsData);
        // console.log("=================");
        // console.log(productIds);
        // console.log(JSON.stringify(productsData, null, 4));
        // console.log("=================");
        const sortingMap = new Map();
        productIds.forEach((id, index) => {
            sortingMap.set(`"${id}"`, index);
        });
        const sortedData = [];
        productsData.forEach((product) => {
            product.main_image = DOMAIN_NAME + product.main_image;
            product.images.forEach((image, index) => {
                product.images[index] = DOMAIN_NAME + product.images[index];
            });
        });
        productsData.forEach((data, index) => {
            const dataIdString = JSON.stringify(data._id);
            sortedData[sortingMap.get(dataIdString)] = data;
        });
        let next_paging = paging + 1;
        if (sortedData.length > 6) {
            sortedData.pop();
        }
        else {
            next_paging = null;
        }
        // console.log(JSON.stringify(sortedData, null, 4));
        const resData = resp(sortedData, next_paging);
        res.json(resData);
    }
    catch (err) {
        console.error(err);
        if (err instanceof Error) {
            res.status(500).json({ errors: err.message });
            return;
        }
        return res.status(500).json({ errors: "search products failed" });
    }
}
function generateImages(files) {
    const images = Object.values(files).reduce((acc, value) => {
        if (Array.isArray(value)) {
            acc.push(...value);
        }
        return acc;
    }, []);
    return images;
}
function isFilesObject(object) {
    return (typeof object === "object" && Object.values(object).every(Array.isArray));
}
export async function checkFileType(req, res, next) {
    if (isFilesObject(req.files)) {
        const images = await Promise.all(generateImages(req.files).map(async (file) => {
            const fileType = await fileTypeFromBuffer(file.buffer);
            return { ...file, ...fileType };
        }));
        images.forEach((image) => {
            if (image.mime !== image.mimetype) {
                throw new Error("fake type");
            }
        });
        res.locals.images = images;
    }
    next();
}
export async function saveImagesToDisk(req, res, next) {
    try {
        if (Array.isArray(res.locals.images) && res.locals.images.length > 0) {
            const images = await Promise.all(res.locals.images.map((image) => new Promise((resolve, reject) => {
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = path.dirname(__filename);
                const filename = `${nanoid(12)}.${image.ext}`;
                const imagePath = path.join(__dirname, `../../uploads/${filename}`);
                fs.writeFile(imagePath, image.buffer, (err) => {
                    if (err) {
                        reject(err);
                    }
                    resolve({ ...image, filename, path: `/uploads/${filename}` });
                });
            })));
            res.locals.images = images;
        }
        next();
    }
    catch (err) {
        console.error(err);
        if (err instanceof Error) {
            res.status(500).json({ errors: err.message });
            return;
        }
        return res.status(500).json({ errors: "save images failed" });
    }
}
export async function createProduct(req, res) {
    try {
        const updatedImages = [];
        for (let i = 0; i < res.locals.images.length; i++) {
            updatedImages.push(res.locals.images[i].filename);
        }
        req.body.main_image = res.locals.images[0].filename;
        req.body.images = updatedImages;
        const TAGS = req.body.tags;
        let CATE_TAGS = [];
        if (typeof TAGS == "string") {
            CATE_TAGS.push(TAGS);
        }
        else {
            CATE_TAGS = TAGS;
        }
        const CATE = req.body.category;
        req.body.tags = CATE_TAGS.map((tag) => {
            return `${CATE}_${tag}`;
        });
        // console.log(req.body);
        const productData = await product.create(req.body);
        // console.log("=================");
        // console.log("productData = " + JSON.stringify(productData, null, 4));
        req.body.id = productData._id;
        req.body.time = productData.time;
        req.body.price = productData.price;
        req.body.colors = productData.colorName;
        req.body.sizes = productData.size;
        const uploadElasticSearch = await uploadProductsToElasticSearch(req.body);
        const productId = productData._id.toString();
        res.status(200).json(productId);
    }
    catch (err) {
        if (err instanceof Error) {
            res.status(500).json({ errors: err.message });
            return;
        }
        res.status(500).json({ errors: "create product failed" });
    }
}
async function getHotProducts() {
    const hotProductsId = await searchHotProducts();
    const hotProducts = await product.find({ _id: { $in: hotProductsId } });
    const sortingMap = new Map();
    hotProductsId.forEach((id, index) => {
        sortingMap.set(`"${id}"`, index);
    });
    const sortedData = [];
    hotProducts.forEach((product) => {
        product.main_image = DOMAIN_NAME + product.main_image;
        product.images.forEach((image, index) => {
            product.images[index] = DOMAIN_NAME + product.images[index];
        });
    });
    hotProducts.forEach((data, index) => {
        const dataIdString = JSON.stringify(data._id);
        sortedData[sortingMap.get(dataIdString)] = data;
    });
    const resData = resp(sortedData, null);
    if (!resData.data.next_paging) {
        delete resData.data.next_paging;
    }
    return resData;
}
export async function getAutoTitle(req, res) {
    // try{
    //   const keyword = req.query.keyword;
    //   const titles = await getAutoIds();
    // }
}
export async function recommendProduct(req, res) {
    try {
        const userId = res.locals.userId;
        const hotProductIds = [];
        let hotProducts;
        // Hot recommendation
        if (!userId) {
            console.log("here!!!");
            const resData = await getHotProducts();
            return res.status(200).json(resData);
        }
        // Personal recommendation
        const sortedSetKey = `${userId}BrowsingHistoryCounter`;
        let tag;
        if (redis.status === "ready") {
            const mostFrequentTag = await redis.zrevrange(sortedSetKey, 0, 0, "WITHSCORES");
            if (mostFrequentTag.length > 0) {
                tag = mostFrequentTag[0];
            }
            else {
                tag = null;
            }
            if (tag) {
                const productsData = await product
                    .find({ tags: { $in: tag } })
                    .skip(0)
                    .limit(10);
                const resData = resp(productsData[0]);
                return res.status(200).json(resData);
            }
        }
        const resData = await getHotProducts();
        res.status(200).json(resData);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ errors: "recomendation failed" });
    }
}
