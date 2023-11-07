import { Client } from "@elastic/elasticsearch";
import { NextFunction, Request, Response } from "express";
import dotenv from "dotenv";
dotenv.config();
//process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const PRODUCTS_PER_PAGE = 6;

const client = new Client({
  node: {
    url: new URL(process.env.ELASTICSEARCH_NODE || "undefined"),
  },
  tls: {
    ca: process.env.ELASTICSEARCH_CERTIFICATE,
    rejectUnauthorized: false,
  },
});

export async function uploadProductsToElasticSearch(productData: {
  id: string;
  category: string;
  tags: string;
  title: string;
  price: number;
  colors: {
    code: string;
    name: string;
  }[];
  sizes: string[];
  time: number;
}) {
  try {
    const { id, category, tags, title, price, colors, sizes, time } =
      productData;

    const createResult = await client.index({
      index: "products",
      body: {
        id,
        category,
        tags,
        click: 0,
        title,
        price,
        colors,
        sizes,
        time,
      },
    });
  } catch (err) {
    console.log(err);
    console.log("something is wrong creating product to elasticsearch");
  }
}

export async function searchProductsIdsFromElastic(
  paging: number,
  keyword: string,
  color: string,
  size: string,
  category: string,
  sorting: string
) {
  const must = [];

  console.log(paging);
  console.log(keyword);
  console.log(color);
  console.log(size);
  console.log(category);
  console.log(sorting);

  if (keyword) {
    console.log("keyword exist~~~~~~");

    must.push({
      match_phrase: {
        title: keyword,
      },
    });
  }

  if (color) {
    must.push({
      match_phrase: {
        colors: color,
      },
    });
  }

  if (size) {
    must.push({
      match_phrase: {
        sizes: size,
      },
    });
  }

  if (category && category !== "all") {
    must.push({
      match_phrase: {
        category: category,
      },
    });
  }

  let sorts: any;

  if (sorting === "newest") {
    console.log("newest~~~~~~~~~~~~~~~~~~~~~~~");
    //sorts = "time:desc";
    sorts = {
      time: {
        order: "desc",
      },
    };
  } else if (sorting === "price_asc") {
    //sorts = "price:asc";
    console.log("price asc");

    sorts = {
      price: { order: "asc" },
    };
  } else if (sorting === "price_desc") {
    //sorts = "price:desc";
    console.log("price desc");

    sorts = {
      price: {
        order: "desc",
      },
    };
  } else {
    console.log("click popular");

    //sorts = "click:desc";
    sorts = {
      click: {
        order: "desc",
      },
    };
  }

  const result: any = await client.search({
    index: "products",

    _source: [
      "id",
      "category",
      "tags",
      "click",
      "title",
      "price",
      "colors",
      "sizes",
    ],
    body: {
      sort: [sorts],
      size: PRODUCTS_PER_PAGE + 1,
      from: PRODUCTS_PER_PAGE * paging,

      query: {
        bool: {
          must: must,
          filter: [],
          should: [],
          must_not: [],
        },
      },
    },
  });

  console.log(JSON.stringify(result, null, 4));

  return result.hits.hits.map((product: any) => {
    return product["_source"]["id"];
  });
}

export async function addClickToElasticSearch(productId: string) {
  try {
    const addResult = await client.updateByQuery({
      index: "products",
      body: {
        script: {
          source: "ctx._source.click=ctx._source.click+1;",
        },
        query: {
          bool: {
            must: [
              {
                match: {
                  _id: productId,
                },
              },
            ],
          },
        },
      },
    });
    return addResult;
  } catch (err) {
    console.log(err);
    console.log("something goes wrong adding click to elastic");

    return null;
  }
}
//
export default client;
