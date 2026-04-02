public class FileWarrantyClaim {
    public class Request {
        @InvocableVariable(required=true description='Warranty number to file a claim against')
        public String warrantyNumber;
    }

    public class Response {
        @InvocableVariable(description='Result message indicating success or failure')
        public String result;

        @InvocableVariable(description='Whether the claim was filed successfully')
        public Boolean success;
    }

    @InvocableMethod(label='File Warranty Claim' description='File a warranty claim by changing the warranty status to Claimed')
    public static List<Response> execute(List<Request> requests) {
        List<Response> responses = new List<Response>();
        for (Request req : requests) {
            Response res = new Response();

            List<Warranty__c> warranties = [
                SELECT Id, Name, Status__c, Expiry_Date__c, Product_Name__c
                FROM Warranty__c
                WHERE Name = :req.warrantyNumber
                LIMIT 1
            ];

            if (warranties.isEmpty()) {
                res.result = 'Warranty ' + req.warrantyNumber + ' not found.';
                res.success = false;
            } else {
                Warranty__c w = warranties[0];

                if (w.Status__c == 'Claimed') {
                    res.result = 'Warranty ' + w.Name + ' has already been claimed.';
                    res.success = false;
                } else if (w.Status__c == 'Expired' || (w.Expiry_Date__c != null && w.Expiry_Date__c < Date.today())) {
                    res.result = 'Warranty ' + w.Name + ' is expired and cannot be claimed.';
                    res.success = false;
                } else if (w.Status__c == 'Voided') {
                    res.result = 'Warranty ' + w.Name + ' has been voided and cannot be claimed.';
                    res.success = false;
                } else {
                    w.Status__c = 'Claimed';
                    update w;
                    res.result = 'Warranty claim filed successfully for ' + w.Name + ' (Product: ' + w.Product_Name__c + '). Status changed to Claimed.';
                    res.success = true;
                }
            }
            responses.add(res);
        }
        return responses;
    }
}
