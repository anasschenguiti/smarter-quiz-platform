const { MongoClient } = require('mongodb');
const XLSX = require('xlsx');

// MongoDB connection URI
const uri = 'mongodb://localhost:27017/game';

// Function to read the Excel file
function readExcelFile(filePath) {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Assuming the data is in the first sheet
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
}

// Function to insert data into MongoDB
async function insertData() {
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db();
        const collection = db.collection('questions');

        // Delete all existing documents in the collection
        await collection.deleteMany({});
        console.log('Existing data deleted.');

        // Read the Excel file
        const filePath = 'Q SMARTER 2023.xlsx'; // Path to your Excel file
        const questions = readExcelFile(filePath);

        // Log the questions to verify they are read correctly
        console.log('Questions read from Excel:', questions);

        // Insert questions into the database
        const result = await collection.insertMany(questions);
        console.log(`${result.insertedCount} questions inserted successfully!`);
    } catch (err) {
        console.error('Error inserting data:', err);
    } finally {
        await client.close();
        console.log('MongoDB connection closed');
    }
}

// Run the script
insertData();