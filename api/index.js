import dotenv from "dotenv";
import express from "express";
import pg from "pg";
import bodyParser from "body-parser";
import multer from "multer";
import axios from "axios";
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the root directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log("DATABASE_URL:", process.env.DATABASE_URL || "Not Loaded"); // Debugging line
console.log("CLOUDINARY_URL is set:", process.env.CLOUDINARY_URL ? "Yes" : "No"); // Debugging line

const app = express();
const port = process.env.PORT || 4000;

// Configure Cloudinary - will automatically use CLOUDINARY_URL env variable
cloudinary.config();

// Set up Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'shopping_app',
    allowed_formats: ['jpg', 'jpeg', 'png']
  }
});

app.use(express.static("public"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Updated Database Connection with error handling
const dbConnectionString = process.env.DATABASE_URL;
if (!dbConnectionString) {
  console.error("DATABASE_URL not found in environment variables!");
}

const db = new pg.Client({
  connectionString: dbConnectionString,
  ssl: dbConnectionString && dbConnectionString.includes("localhost") ? false : { rejectUnauthorized: false }
});

db.connect().catch(err => console.error("Database connection error:", err));

// Rest of your code remains unchanged...

// Set up multer with Cloudinary storage
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
  let imageUrl;

  if (req.file) {
    // When using Cloudinary, req.file.path contains the URL
    imageUrl = req.file.path;
  } else if (image_url) {
    try {
      // Upload external image to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(image_url);
      imageUrl = uploadResult.secure_url;
      console.log("Image uploaded to Cloudinary:", imageUrl);
    } catch (error) {
      console.error("Error uploading image to Cloudinary:", error);
      return res.status(400).send("Invalid image URL.");
    }
  } else {
    return res.status(400).send("No image provided.");
  }

  db.query(
    "INSERT INTO product (product_description, product_price, product_image) VALUES ($1, $2, $3)",
    [product_description, product_price, imageUrl],
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
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

export default app;