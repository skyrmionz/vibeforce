public class CheckWarrantyActive {
    public class Request {
        @InvocableVariable(required=true description='Warranty number to check')
        public String warrantyNumber;
    }

    public class Response {
        @InvocableVariable(description='Whether the warranty is currently active')
        public Boolean isActive;

        @InvocableVariable(description='Detailed status message about the warranty')
        public String statusMessage;
    }

    @InvocableMethod(label='Check Warranty Active' description='Check if a warranty is still active based on status and expiry date')
    public static List<Response> execute(List<Request> requests) {
        List<Response> responses = new List<Response>();
        for (Request req : requests) {
            Response res = new Response();

            List<Warranty__c> warranties = [
                SELECT Id, Name, Status__c, Expiry_Date__c, Product_Name__c, Coverage_Amount__c
                FROM Warranty__c
                WHERE Name = :req.warrantyNumber
                LIMIT 1
            ];

            if (warranties.isEmpty()) {
                res.isActive = false;
                res.statusMessage = 'Warranty ' + req.warrantyNumber + ' not found.';
            } else {
                Warranty__c w = warranties[0];
                Boolean statusActive = w.Status__c == 'Active';
                Boolean notExpired = w.Expiry_Date__c == null || w.Expiry_Date__c >= Date.today();

                res.isActive = statusActive && notExpired;

                if (res.isActive) {
                    Integer daysRemaining = w.Expiry_Date__c != null
                        ? Date.today().daysBetween(w.Expiry_Date__c)
                        : null;
                    String daysMsg = daysRemaining != null
                        ? ' (' + daysRemaining + ' days remaining)'
                        : '';
                    res.statusMessage = 'Warranty ' + w.Name + ' is ACTIVE for ' + w.Product_Name__c +
                        '. Coverage: ' + w.Coverage_Amount__c + '. Expires: ' + w.Expiry_Date__c + daysMsg + '.';
                } else {
                    res.statusMessage = 'Warranty ' + w.Name + ' is NOT active. Current status: ' + w.Status__c +
                        '. Expiry date: ' + w.Expiry_Date__c + '.';
                }
            }
            responses.add(res);
        }
        return responses;
    }
}
