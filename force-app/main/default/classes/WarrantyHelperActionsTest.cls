@isTest
private class WarrantyHelperActionsTest {

    @TestSetup
    static void setupData() {
        Account acct = new Account(Name = 'Acme Corp');
        insert acct;

        Contact ctct = new Contact(
            FirstName = 'Jane',
            LastName = 'Doe',
            AccountId = acct.Id
        );
        insert ctct;

        List<Warranty__c> warranties = new List<Warranty__c>{
            new Warranty__c(
                Account__c = acct.Id,
                Contact__c = ctct.Id,
                Status__c = 'Active',
                Product_Name__c = 'Solar Panel X200',
                Coverage_Amount__c = 5000,
                Expiry_Date__c = Date.today().addYears(1),
                Purchase_Date__c = Date.today().addYears(-1)
            ),
            new Warranty__c(
                Account__c = acct.Id,
                Contact__c = ctct.Id,
                Status__c = 'Expired',
                Product_Name__c = 'Battery Pack B100',
                Coverage_Amount__c = 2000,
                Expiry_Date__c = Date.today().addDays(-30),
                Purchase_Date__c = Date.today().addYears(-3)
            ),
            new Warranty__c(
                Account__c = acct.Id,
                Contact__c = ctct.Id,
                Status__c = 'Claimed',
                Product_Name__c = 'Inverter I50',
                Coverage_Amount__c = 1500,
                Expiry_Date__c = Date.today().addMonths(6),
                Purchase_Date__c = Date.today().addYears(-2)
            )
        };
        insert warranties;
    }

    @isTest
    static void testLookupByWarrantyNumber() {
        Warranty__c w = [SELECT Name FROM Warranty__c WHERE Product_Name__c = 'Solar Panel X200' LIMIT 1];

        LookupWarranty.Request req = new LookupWarranty.Request();
        req.warrantyNumber = w.Name;

        List<LookupWarranty.Response> results = LookupWarranty.execute(new List<LookupWarranty.Request>{ req });

        System.assertEquals(1, results[0].count);
        System.assert(results[0].warranties.contains('Solar Panel X200'));
    }

    @isTest
    static void testLookupByCustomerName() {
        LookupWarranty.Request req = new LookupWarranty.Request();
        req.customerName = 'Acme';

        List<LookupWarranty.Response> results = LookupWarranty.execute(new List<LookupWarranty.Request>{ req });

        System.assertEquals(3, results[0].count);
    }

    @isTest
    static void testLookupNotFound() {
        LookupWarranty.Request req = new LookupWarranty.Request();
        req.warrantyNumber = 'W-DOESNOTEXIST';

        List<LookupWarranty.Response> results = LookupWarranty.execute(new List<LookupWarranty.Request>{ req });

        System.assertEquals(0, results[0].count);
        System.assert(results[0].warranties.contains('No warranties found'));
    }

    @isTest
    static void testFileClaimSuccess() {
        Warranty__c w = [SELECT Name FROM Warranty__c WHERE Product_Name__c = 'Solar Panel X200' LIMIT 1];

        FileWarrantyClaim.Request req = new FileWarrantyClaim.Request();
        req.warrantyNumber = w.Name;

        List<FileWarrantyClaim.Response> results = FileWarrantyClaim.execute(new List<FileWarrantyClaim.Request>{ req });

        System.assertEquals(true, results[0].success);
        System.assert(results[0].result.contains('successfully'));

        w = [SELECT Status__c FROM Warranty__c WHERE Id = :w.Id];
        System.assertEquals('Claimed', w.Status__c);
    }

    @isTest
    static void testFileClaimAlreadyClaimed() {
        Warranty__c w = [SELECT Name FROM Warranty__c WHERE Product_Name__c = 'Inverter I50' LIMIT 1];

        FileWarrantyClaim.Request req = new FileWarrantyClaim.Request();
        req.warrantyNumber = w.Name;

        List<FileWarrantyClaim.Response> results = FileWarrantyClaim.execute(new List<FileWarrantyClaim.Request>{ req });

        System.assertEquals(false, results[0].success);
        System.assert(results[0].result.contains('already been claimed'));
    }

    @isTest
    static void testFileClaimExpired() {
        Warranty__c w = [SELECT Name FROM Warranty__c WHERE Product_Name__c = 'Battery Pack B100' LIMIT 1];

        FileWarrantyClaim.Request req = new FileWarrantyClaim.Request();
        req.warrantyNumber = w.Name;

        List<FileWarrantyClaim.Response> results = FileWarrantyClaim.execute(new List<FileWarrantyClaim.Request>{ req });

        System.assertEquals(false, results[0].success);
        System.assert(results[0].result.contains('expired'));
    }

    @isTest
    static void testFileClaimNotFound() {
        FileWarrantyClaim.Request req = new FileWarrantyClaim.Request();
        req.warrantyNumber = 'W-DOESNOTEXIST';

        List<FileWarrantyClaim.Response> results = FileWarrantyClaim.execute(new List<FileWarrantyClaim.Request>{ req });

        System.assertEquals(false, results[0].success);
        System.assert(results[0].result.contains('not found'));
    }

    @isTest
    static void testCheckWarrantyActiveTrue() {
        Warranty__c w = [SELECT Name FROM Warranty__c WHERE Product_Name__c = 'Solar Panel X200' LIMIT 1];

        CheckWarrantyActive.Request req = new CheckWarrantyActive.Request();
        req.warrantyNumber = w.Name;

        List<CheckWarrantyActive.Response> results = CheckWarrantyActive.execute(new List<CheckWarrantyActive.Request>{ req });

        System.assertEquals(true, results[0].isActive);
        System.assert(results[0].statusMessage.contains('ACTIVE'));
    }

    @isTest
    static void testCheckWarrantyActiveFalseExpired() {
        Warranty__c w = [SELECT Name FROM Warranty__c WHERE Product_Name__c = 'Battery Pack B100' LIMIT 1];

        CheckWarrantyActive.Request req = new CheckWarrantyActive.Request();
        req.warrantyNumber = w.Name;

        List<CheckWarrantyActive.Response> results = CheckWarrantyActive.execute(new List<CheckWarrantyActive.Request>{ req });

        System.assertEquals(false, results[0].isActive);
        System.assert(results[0].statusMessage.contains('NOT active'));
    }

    @isTest
    static void testCheckWarrantyNotFound() {
        CheckWarrantyActive.Request req = new CheckWarrantyActive.Request();
        req.warrantyNumber = 'W-DOESNOTEXIST';

        List<CheckWarrantyActive.Response> results = CheckWarrantyActive.execute(new List<CheckWarrantyActive.Request>{ req });

        System.assertEquals(false, results[0].isActive);
        System.assert(results[0].statusMessage.contains('not found'));
    }
}
