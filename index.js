import express from "express";
import pg from "pg";
import bodyParser from "body-parser";
import multer from "multer";
import axios from "axios";
import fs from "fs";
import path from "path";
import sharp from "sharp"; // Import sharp for image processing

const app = express();
const port = 4000;

app.use(express.static("public"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Updated Database Connection
const db = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Neon
});
db.connect();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads'); // Directory to save uploaded images
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname); // Unique filename
    }
});

const upload = multer({ storage: storage });

// Create a table for products if it doesn't exist
db.query(`
    CREATE TABLE IF NOT EXISTS product (
        id SERIAL PRIMARY KEY,
        product_description VARCHAR(500),
        product_price VARCHAR(10),
        product_image TEXT
    )
`);

// Route to handle image upload and product details
app.post('/upload', upload.single('product_image'), async (req, res) => {
    console.log('Incoming Request:', req.body); // Log the entire request body
    console.log('File Object:', req.file); // Log the file object

    const { product_description, product_price, image_url } = req.body; // Get image_url from the request body

    let imagePath;

    if (req.file) {
        imagePath = req.file.path; // Get the path of the uploaded image
    } else if (image_url) {
        // Download the image from the URL and save it to the uploads directory
        const response = await axios({
            method: 'get',
            url: image_url,
            responseType: 'arraybuffer' // Use arraybuffer to handle binary data
        });

        const sanitizedFileName = image_url.replace(/[^a-zA-Z0-9]/g, '_'); // Sanitize the filename
        imagePath = `uploads/${Date.now()}-${sanitizedFileName}.jpg`; // Set the path for the JPG file

        // Convert and save the image as JPG
        await sharp(response.data)
            .toFile(imagePath); // Await the file saving process

        console.log('Image downloaded and saved:', imagePath);
    } else {
        return res.status(400).send('No image provided.');
    }

    db.query('INSERT INTO product (product_description, product_price, product_image) VALUES ($1, $2, $3)', 
        [product_description, product_price, imagePath], (err) => {
        if (err) { 
            console.error('Database Error:', err); // Log the actual error from the database
            return res.status(500).send('Error saving product to database');
        }
        res.status(200).send('Product uploaded successfully');
    });
});

app.get("/", async (req, res) => {
    const result = await db.query("SELECT * FROM product");
    res.json(result.rows);
});

app.get("/:id", async (req, res) => {
    const id = req.params.id;
    const result = await db.query("SELECT * FROM product WHERE id = $1", [id]);
    res.json(result.rows[0]);
});

app.listen(port, () => {
    console.log(`API is running at http://localhost:${port}`);
});
