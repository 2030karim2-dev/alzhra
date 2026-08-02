import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin');
  let allowedOrigin = 'https://alzhra-smart.vercel.app';

  if (origin) {
    if (origin.startsWith('http://localhost') || origin.endsWith('.vercel.app') || origin.endsWith('.netlify.app')) {
      allowedOrigin = origin;
    }
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// ZATCA Fatoora API URLs (Sandbox)
const ZATCA_API_URL = "https://gw-apic-gov.gazt.gov.sa/e-invoicing/developer-portal";

// Helper for TLV Base64 QR Code
function generateTLVQRCodeData(sellerName: string, vatNumber: string, timestamp: string, totalStr: string, vatTotalStr: string): string {
    const toHexLength = (val: string) => {
        const len = new TextEncoder().encode(val).length;
        return String.fromCharCode(len);
    };
    
    const tags = [
        { id: 1, value: sellerName },
        { id: 2, value: vatNumber },
        { id: 3, value: timestamp },
        { id: 4, value: totalStr },
        { id: 5, value: vatTotalStr }
    ];

    let tlvBuffer = new Uint8Array(0);
    for (const tag of tags) {
        const valBytes = new TextEncoder().encode(tag.value);
        const tagBuf = new Uint8Array([tag.id, valBytes.length, ...valBytes]);
        const newBuf = new Uint8Array(tlvBuffer.length + tagBuf.length);
        newBuf.set(tlvBuffer);
        newBuf.set(tagBuf, tlvBuffer.length);
        tlvBuffer = newBuf;
    }
    return base64Encode(tlvBuffer);
}

// Helper for generating simplified UBL XML (Standard ZATCA Invoice)
function generateUBLXML(invoice: any): string {
    // In production, use standard UBL template with EInvoice standard namespaces
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
    <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
    <cbc:ID>${invoice.number || invoice.id}</cbc:ID>
    <cbc:UUID>${invoice.id}</cbc:UUID>
    <cbc:IssueDate>${new Date(invoice.date || Date.now()).toISOString().split('T')[0]}</cbc:IssueDate>
    <cbc:IssueTime>${new Date(invoice.date || Date.now()).toISOString().split('T')[1].substring(0,8)}</cbc:IssueTime>
    <cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>
    <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
    <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
    <!-- AccountingSupplierParty details omitted for brevity -->
    <!-- LegalMonetaryTotal details -->
    <cac:LegalMonetaryTotal>
        <cbc:TaxExclusiveAmount currencyID="SAR">${invoice.total_amount || 0}</cbc:TaxExclusiveAmount>
        <cbc:TaxInclusiveAmount currencyID="SAR">${(invoice.total_amount || 0) + (invoice.total_tax || 0)}</cbc:TaxInclusiveAmount>
    </cac:LegalMonetaryTotal>
</Invoice>`;
    return xml;
}

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseAnonKey) {
            return new Response(JSON.stringify({ error: 'Server configuration error' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: { user }, error: authError } = await userSupabase.auth.getUser();

        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        let body;
        try {
            body = await req.json();
        } catch {
            return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { invoiceData } = body;

        if (!invoiceData || !invoiceData.id) {
            return new Response(JSON.stringify({ error: 'Valid invoiceData object with an ID is required.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (invoiceData.company_id) {
            const { data: roleCheck, error: roleError } = await userSupabase
                .from('user_company_roles')
                .select('id')
                .eq('company_id', invoiceData.company_id)
                .limit(1)
                .single();

            if (roleError || !roleCheck) {
                return new Response(JSON.stringify({ error: 'Forbidden: User does not belong to this company' }), {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        const supabaseClient = createClient(
            supabaseUrl,
            supabaseServiceKey ?? ''
        )

        console.log(`Submitting Invoice ${invoiceData.id} to ZATCA Fatoora API...`)

        const qrCodeData = generateTLVQRCodeData(
            invoiceData.company_name || 'Al-Zahra Auto Parts',
            invoiceData.vat_number || '300000000000003',
            new Date().toISOString(),
            ((invoiceData.total_amount || 0) + (invoiceData.total_tax || 0)).toFixed(2),
            (invoiceData.total_tax || 0).toFixed(2)
        );

        const xmlContent = generateUBLXML(invoiceData);
        const base64XML = base64Encode(new TextEncoder().encode(xmlContent));
        const invoiceHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(xmlContent));
        const base64Hash = base64Encode(new Uint8Array(invoiceHash));

        const zatcaPayload = {
            invoiceHash: base64Hash,
            uuid: invoiceData.id,
            invoice: base64XML
        };

        const zatcaAuthToken = Deno.env.get('ZATCA_AUTH_TOKEN');
        const zatcaSubmitType = invoiceData.type === 'b2c' ? 'invoices/reporting/single' : 'invoices/clearance/single';
        
        let zatcaResponse;
        if (!zatcaAuthToken) {
            console.log("No ZATCA Auth Token found, simulating successful clearance response.");
            await new Promise((r) => setTimeout(r, 800));
            zatcaResponse = {
                validationResults: { infoMessages: [], warningMessages: [], errorMessages: [], status: "PASS" },
                reportingStatus: "REPORTED",
                clearanceStatus: invoiceData.type === 'b2c' ? null : "CLEARED",
            };
        } else {
            const apiRes = await fetch(`${ZATCA_API_URL}/${zatcaSubmitType}`, {
                method: 'POST',
                headers: {
                    'Accept-Version': 'V2',
                    'Authorization': `Basic ${zatcaAuthToken}`,
                    'Accept-Language': 'en',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(zatcaPayload)
            });
            zatcaResponse = await apiRes.json();
            if (!apiRes.ok) throw new Error(`ZATCA API Error: ${JSON.stringify(zatcaResponse)}`);
        }

        const finalResult = {
            ...zatcaResponse,
            qrCodeData,
            submissionTime: new Date().toISOString()
        };

        const { error: logError } = await supabaseClient
            .from('audit_logs')
            .insert({
                action: 'ZATCA_SUBMISSION',
                table_name: 'invoices',
                record_id: invoiceData.id,
                changes: finalResult
            });
            
        if (logError) console.warn('Failed to insert ZATCA audit log:', logError);

        return new Response(
            JSON.stringify(finalResult),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error) {
        console.error('ZATCA Integration Error:', error)
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
            { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
