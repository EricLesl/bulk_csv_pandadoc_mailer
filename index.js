const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');

// Define the API key
const API_KEY = 'YOUR_API_KEY_HERE';

// First, count total number of rows
let totalRows = 0;
fs.createReadStream('INPUT_FILE.csv') //NOTE: Pandadoc seems to start hitting rate limits if your csv has more than 50 rows. I generally split it into multiple files and run them separately if I have more than 50 rows. Tedius but it works. You could try and refactor this code to wait like 5 minutes after 50 rows and then continue but I haven't tried that yet.
    .pipe(csv())
    .on('data', (row) => {
        totalRows++;
    })
    .on('end', () => {
        processFile(); // Process the file after we've counted the rows
    });

function processFile() {
    // Process the CSV file
    let processedRows = 0;
    fs.createReadStream('INPUT_FILE.csv')
        .pipe(csv())
        .on('data', (row) => {
            setTimeout(async () => {
                let recipients = [];
                let templateUuid = 'EUezSwsgXntYBZGKzQwX83';
                let folderUuid = 'LfGYvVhCtqfwwcAHD8isBd';

                let emailAdded = false;

                //Check to make sure email is valid (not a full check but at least making sure @ is there)
                if (row.email.includes("@")) {
                    recipients.push({
                        "email": row.email, // replace with whatever email column is called
                        "first_name": row.firstName, //replace with whatever first name column is called
                        "last_name": row.lastName, // replace with whatever last name column is called
                        "role": "Grower" // replace with whatever role you want to assign from your PandaDoc template
                    })
                    emailAdded = true;
                }

                // Loop through each row and create the payload
                const data = {
                    "name": row.account,
                    "template_uuid": templateUuid,
                    "folder_uuid": folderUuid,
                    "recipients": recipients,
                    "tokens": [
                        //You will need to add as many tokens here as you want to send and fill in on the template. I appended with Grower as I named the variables in the PandaDoc template that to go with the role. You will need to make the 'name' the variable name and the value is the data you send.
                        {
                            "name": "Grower.firstName",
                            "value": row.firstName
                        },
                        {
                            "name": "Grower.lastName",
                            "value": row.lastName
                        }
                    ]
                };

                try {
                    //This is the endpoint that just creates the document from the template - it doesn't send it yet
                    const res = await axios({
                        method: 'post',
                        url: 'https://api.pandadoc.com/public/v1/documents',
                        data: data,
                        headers: {
                            'Authorization': `API-KEY ${API_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    // Log required information and progress
                    processedRows++;
                    const progress = (processedRows / totalRows) * 100;
                    console.log(`progress: ${progress.toFixed(2)}%`);

                    // If the document was successfully created and emailAdded == true, then poll the document status
                    // We need to wait and make sure PandaDoc is done creating the document before we can send it
                    if ((emailAdded) && res.data.id) {
                        let documentStatus = '';
                        //if it is draft the send request will fail
                        while (documentStatus !== 'document.draft') {
                            await new Promise(r => setTimeout(r, 3000)); // wait for 3 seconds before polling again

                            //This gets the document status from PandaDoc
                            const statusRes = await axios({
                                method: 'get',
                                url: `https://api.pandadoc.com/public/v1/documents/${res.data.id}/details`,
                                headers: {
                                    'Authorization': `API-KEY ${API_KEY}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                            documentStatus = statusRes.data.status;
                        }

                        //This calls the send endpoint and actually emails out the document for signing
                        //If you only want to create the document and not send it, comment out this whole section for polling
                        const sendRes = await axios({
                            method: 'post',
                            url: `https://api.pandadoc.com/public/v1/documents/${res.data.id}/send`,
                            data: {
                                message: "YOUR_EMAIL_MESSAGE_HERE" //This message is what shows up in the email of the signer
                            },
                            headers: {
                                'Authorization': `API-KEY ${API_KEY}`,
                                'Content-Type': 'application/json'
                            }
                        });

                        console.log(`Document ${res.data.id} sent`);
                    }

                } catch (error) {
                    console.error(row.account, error);
                }
            }, processedRows * 2000); // Delay 2 seconds per row
        })
        .on('end', () => {
            console.log('CSV file successfully processed');
        });
}