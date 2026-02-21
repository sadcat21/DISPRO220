import https from 'https';

const url = 'https://lygyeesqdenbauimkrjy.supabase.co/rest/v1/customer_approval_requests?status=eq.pending';
const options = {
    method: 'GET',
    headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5Z3llZXNxZGVuYmF1aW1rcmp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDg4MjQsImV4cCI6MjA4NTY4NDgyNH0.p6E_tk81qo-j2-9RTXMba4UqiObS5Esvx7TJBTYuD1g',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5Z3llZXNxZGVuYmF1aW1rcmp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDg4MjQsImV4cCI6MjA4NTY4NDgyNH0.p6E_tk81qo-j2-9RTXMba4UqiObS5Esvx7TJBTYuD1g'
    }
};

const req = https.request(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log(JSON.stringify(json, null, 2));
        } catch (e) {
            console.log('Error parsing response:', data);
        }
    });
});

req.on('error', (e) => {
    console.error('Request error:', e);
});

req.end();
