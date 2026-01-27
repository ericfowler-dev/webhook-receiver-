/**
 * PSI Portal Webhook Receiver
 * Receives Support Request data from PSI Portal Data Connection
 *
 * Deploy this to Render.com as a Web Service
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Store received data in memory (for demo) or write to file
let receivedData = [];

// Middleware to parse JSON
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'PSI Webhook Receiver',
        receivedCount: receivedData.length,
        lastReceived: receivedData.length > 0
            ? receivedData[receivedData.length - 1].timestamp
            : null
    });
});

// GET handler for webhook endpoint (for PSI Portal test connectivity)
app.get('/webhook/support-requests', (req, res) => {
    console.log(`[${new Date().toISOString()}] GET test request received`);
    res.status(200).json({
        status: 'SUCCESS',
        message: 'Webhook endpoint is available',
        method: 'GET',
        ready: true
    });
});

// Main webhook endpoint - receives Support Request data
app.post('/webhook/support-requests', (req, res) => {
    try {
        const timestamp = new Date().toISOString();

        console.log(`[${timestamp}] Received webhook data`);
        console.log(`Content-Type: ${req.headers['content-type']}`);
        console.log(`Body type: ${typeof req.body}`);

        // Store the received data
        const dataEntry = {
            timestamp: timestamp,
            headers: req.headers,
            data: req.body
        };

        receivedData.push(dataEntry);

        // Keep only last 100 entries in memory
        if (receivedData.length > 100) {
            receivedData = receivedData.slice(-100);
        }

        // Log summary
        if (req.body && req.body.items) {
            console.log(`Received ${req.body.items.length} Support Requests`);
        } else if (Array.isArray(req.body)) {
            console.log(`Received array with ${req.body.length} items`);
        }

        // Respond with success
        res.status(200).json({
            status: 'SUCCESS',
            message: 'Data received successfully',
            timestamp: timestamp,
            recordsReceived: req.body?.items?.length || (Array.isArray(req.body) ? req.body.length : 1)
        });

    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({
            status: 'ERROR',
            message: error.message
        });
    }
});

// Endpoint to view received data
app.get('/data', (req, res) => {
    res.json({
        totalReceived: receivedData.length,
        data: receivedData.slice(-10) // Return last 10 entries
    });
});

// Endpoint to get latest data
app.get('/data/latest', (req, res) => {
    if (receivedData.length === 0) {
        return res.json({ message: 'No data received yet' });
    }
    res.json(receivedData[receivedData.length - 1]);
});

// Endpoint to download all data as JSON
app.get('/data/download', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=support-requests.json');
    res.json(receivedData);
});

// Clear data endpoint (for testing)
app.delete('/data', (req, res) => {
    receivedData = [];
    res.json({ message: 'Data cleared' });
});

// Start server
app.listen(PORT, () => {
    console.log(`==============================================`);
    console.log(`PSI Webhook Receiver running on port ${PORT}`);
    console.log(`==============================================`);
    console.log(`Endpoints:`);
    console.log(`  GET  /                         - Health check`);
    console.log(`  POST /webhook/support-requests - Receive data`);
    console.log(`  GET  /data                     - View received data`);
    console.log(`  GET  /data/latest              - Get latest entry`);
    console.log(`  GET  /data/download            - Download all data`);
    console.log(`==============================================`);
});
