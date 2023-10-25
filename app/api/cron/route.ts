import Product from "@/lib/models/product.model";
import { connectToDB } from "@/lib/mongoose";
import { generateEmailBody, sendEmail } from "@/lib/nodeMailer";
import { scrapeAmazonProduct } from "@/lib/scraper";
import {
  getAveragePrice,
  getEmailNotifType,
  getHighestPrice,
  getLowestPrice,
} from "@/lib/utils";
import { profile } from "console";
import { NextResponse } from "next/server";

export const maxDuration = 10;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    connectToDB();

    const products = await Product.find({});

    if (!products) throw new Error("No Products found");

    // 1. SCRAPE LATEST PRODUCT DETAILS & UPDATE DB
    const updateProducts = await Promise.all(
      products.map(async (currentProduct) => {
        const scrapedProduct = await scrapeAmazonProduct(currentProduct.url);
        if (!scrapedProduct || !scrapedProduct.title)
          throw new Error("No Product found");

        const updatePriceHistory: any = [
          ...currentProduct.priceHistory,
          { price: scrapedProduct.currentPrice },
        ];

        const product = {
          ...scrapedProduct,
          priceHistory: updatePriceHistory,
          lowestPrice: getLowestPrice(updatePriceHistory),
          highestPrice: getHighestPrice(updatePriceHistory),
          averagePrice: getAveragePrice(updatePriceHistory),
        };

        const updateProduct = await Product.findOneAndUpdate(
          { url: product.url },
          product
        );

        // 2. Check each product's status & send email accordingly
        const emailNotifType = getEmailNotifType(
          scrapedProduct,
          currentProduct
        );

        if (emailNotifType && updateProduct.users.length > 0) {
          const productInfo = {
            title: updateProduct.title,
            url: updateProduct.url,
          };

          const emailContent = await generateEmailBody(
            productInfo,
            emailNotifType
          );

          const userEmails = updateProduct.user.map((user: any) => user.email);

          await sendEmail(emailContent, userEmails);
        }

        return updateProduct;
      })
    );

    return NextResponse.json({
      message: "Ok",
      data: updateProducts,
    });
  } catch (error: any) {
    throw new Error(`Error in GET: ${error}`);
  }
}
