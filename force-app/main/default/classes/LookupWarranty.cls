public class LookupWarranty {
    public class Request {
        @InvocableVariable(description='Warranty number to search for')
        public String warrantyNumber;

        @InvocableVariable(description='Customer name to search for (searches Account and Contact)')
        public String customerName;
    }

    public class Response {
        @InvocableVariable(description='Comma-separated list of warranty details found')
        public String warranties;

        @InvocableVariable(description='Number of warranties found')
        public Integer count;
    }

    @InvocableMethod(label='Lookup Warranty' description='Look up warranty records by warranty number or customer name')
    public static List<Response> execute(List<Request> requests) {
        List<Response> responses = new List<Response>();
        for (Request req : requests) {
            Response res = new Response();
            List<Warranty__c> results = new List<Warranty__c>();

            if (String.isNotBlank(req.warrantyNumber)) {
                results = [
                    SELECT Id, Name, Status__c, Product_Name__c, Product__c,
                           Coverage_Amount__c, Expiry_Date__c, Purchase_Date__c,
                           Account__r.Name, Contact__r.Name
                    FROM Warranty__c
                    WHERE Name = :req.warrantyNumber
                    LIMIT 10
                ];
            } else if (String.isNotBlank(req.customerName)) {
                String searchTerm = '%' + String.escapeSingleQuotes(req.customerName) + '%';
                results = [
                    SELECT Id, Name, Status__c, Product_Name__c, Product__c,
                           Coverage_Amount__c, Expiry_Date__c, Purchase_Date__c,
                           Account__r.Name, Contact__r.Name
                    FROM Warranty__c
                    WHERE Account__r.Name LIKE :searchTerm
                       OR Contact__r.Name LIKE :searchTerm
                    LIMIT 10
                ];
            }

            if (results.isEmpty()) {
                res.warranties = 'No warranties found.';
                res.count = 0;
            } else {
                List<String> lines = new List<String>();
                for (Warranty__c w : results) {
                    String acctName = w.Account__r != null ? w.Account__r.Name : 'N/A';
                    String ctctName = w.Contact__r != null ? w.Contact__r.Name : 'N/A';
                    String productDisplay = String.isNotBlank(w.Product_Name__c) ? w.Product_Name__c : w.Product__c;
                    lines.add(
                        'Warranty: ' + w.Name +
                        ' | Status: ' + w.Status__c +
                        ' | Product: ' + productDisplay +
                        ' | Coverage: ' + w.Coverage_Amount__c +
                        ' | Expires: ' + w.Expiry_Date__c +
                        ' | Account: ' + acctName +
                        ' | Contact: ' + ctctName
                    );
                }
                res.warranties = String.join(lines, '\n');
                res.count = results.size();
            }
            responses.add(res);
        }
        return responses;
    }
}
