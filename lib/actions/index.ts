"use server";

import { Product, User } from "@/types";
import * as ProductDb from "../models/product.model";
import { connectToDB } from "../mongoose";
import { scrapeAmazonProduct } from "../scraper";
import { getAveragePrice, getHighestPrice, getLowestPrice } from "../utils";
import { revalidatePath } from "next/cache";
import { generateEmailBody, sendEmail } from "../nodeMailer";

export async function scrapeAndStoreProduct(productUrl: string) {
  if (!productUrl) return;
  try {
    connectToDB();
    const scrapedProduct = await scrapeAmazonProduct(productUrl);
    if (!scrapedProduct) return;

    let product = scrapedProduct;

    const existingProduct: Product | null = await ProductDb.default.findOne({
      url: scrapedProduct.url,
    });
    if (existingProduct) {
      const updatePriceHistory: any = [
        ...existingProduct.priceHistory,
        { price: scrapedProduct.currentPrice },
      ];

      product = {
        ...scrapedProduct,
        priceHistory: updatePriceHistory,
        lowestPrice: getLowestPrice(updatePriceHistory),
        highestPrice: getHighestPrice(updatePriceHistory),
        averagePrice: getAveragePrice(updatePriceHistory),
      };
    }

    const newProduct = await ProductDb.default.findOneAndUpdate(
      { url: scrapedProduct.url },
      product,
      { upsert: true, new: true }
    );

    revalidatePath(`/products/${newProduct._id}`);
  } catch (error: any) {
    console.log(error.message);
    throw new Error(`Failed to create/update product: ${error.message}`);
  }
}

export async function getProductById(productId: string) {
  try {
    connectToDB();
    const product = await ProductDb.default.findById({ _id: productId });

    if (!product) return null;

    return product;
  } catch (error) {}
}

export async function getAllProduct() {
  try {
    connectToDB();
    const products = await ProductDb.default.find({});
    return products;
  } catch (error: any) {
    console.log(error);
  }
}

export async function getSimilarProduct(productId: string) {
  try {
    connectToDB();
    const currentProduct = await ProductDb.default.findById(productId);
    if (!currentProduct) return null;

    const similarProducts: Product[] = await ProductDb.default
      .find({ _id: { $ne: productId } })
      .limit(3);
    return similarProducts;
  } catch (error: any) {
    console.log(error);
  }
}

export async function addUserEmailToProduct(
  productId: string,
  userEmail: string
) {
  try {
    const product = await ProductDb.default.findById(productId);
    if (!product) return;
    const userExist = product.users.some(
      (user: User) => user.email === userEmail
    );
    if (!userExist) product.users.push({ email: userEmail });
    await product.save();
    const emailContent = await generateEmailBody(product, "WELCOME");

    await sendEmail(emailContent, [userEmail]);
  } catch (error: any) {
    console.log(error);
  }
}
