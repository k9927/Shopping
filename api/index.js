import dotenv from "dotenv";
import path from "path";

// Force dotenv to load from the correct location
dotenv.config({ path: path.resolve("C:/Users/HP/OneDrive/Desktop/shopping/.env") });

console.log("DATABASE_URL:", process.env.DATABASE_URL || "Not Loaded"); // Debugging line

import express from "express";
import pg from "pg";
import bodyParser from "body-parser";
import multer from "multer";
import axios from "axios";
import fs from "fs";
import sharp from "sharp"; 
;

 // Load .env variables

const app = express();
const port = 4000; 

// Make uploads folder publicly accessible
app.use("/uploads", express.static("uploads"));
app.use(express.static("public"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Updated Database Connection
const db = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
});
db.connect().catch(err => console.error("Database connection error:", err));

// Ensure the uploads directory exists
if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
}

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads"); // Save images to 'uploads' directory
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname); // Unique filename
    }
});

const upload = multer({ storage: storage });

// Create table if not exists
db.query(`
    CREATE TABLE IF NOT EXISTS product (
        id SERIAL PRIMARY KEY,
        product_description VARCHAR(500),
        product_price VARCHAR(10),
        product_image TEXT
    )
`);

// Route to handle image upload and product details
app.post("/upload", upload.single("product_image"), async (req, res) => {
    console.log("Incoming Request:", req.body);
    console.log("File Object:", req.file);

    const { product_description, product_price, image_url } = req.body;
    let imagePath;

    if (req.file) {
        imagePath = req.file.path; // Use uploaded file path
    } else if (image_url) {
        try {
            const response = await axios.get(image_url, { responseType: "arraybuffer" });
            const sanitizedFileName = image_url.replace(/[^a-zA-Z0-9]/g, "_");
            imagePath = `uploads/${Date.now()}-${sanitizedFileName}.jpg`;

            // Convert and save as JPG
            await sharp(response.data).toFile(imagePath);
            console.log("Image downloaded and saved:", imagePath);
        } catch (error) {
            console.error("Error downloading image:", error);
            return res.status(400).send("Invalid image URL.");
        }
    } else {
        return res.status(400).send("No image provided.");
    }

    db.query(
        "INSERT INTO product (product_description, product_price, product_image) VALUES ($1, $2, $3)",
        [product_description, product_price, imagePath],
        (err) => {
            if (err) {
                console.error("Database Error:", err);
                return res.status(500).send("Error saving product to database.");
            }
            res.status(200).send("Product uploaded successfully.");
        }
    );
});

// Fetch all products
app.get("/", async (req, res) => {
    const result = await db.query("SELECT * FROM product");
    res.json(result.rows);
});

// Fetch a product by ID
app.get("/:id", async (req, res) => {
    const id = req.params.id;
    const result = await db.query("SELECT * FROM product WHERE id = $1", [id]);
    res.json(result.rows[0]);
});

// Start the server
export default app;

