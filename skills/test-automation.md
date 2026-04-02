---
name: Test Automation
description: Generate comprehensive Apex test suites with data factories, code coverage tracking, mock patterns, and bulk testing
trigger: When user asks to write tests, improve code coverage, create test data factories, set up test automation, or check test coverage
tools_used: execute, write_file, read_file, edit_file
---

# Test Automation Skill

Build comprehensive Apex test suites: TestDataFactory, unit tests, integration tests, mock patterns, bulk tests, and coverage analysis.

## Prerequisites

Verify org connection and existing test classes:

```
execute("sf org display --target-org dev")
execute("sf data query --query \"SELECT Name, Status, ApexClassOrTrigger.Name FROM ApexCodeCoverageAggregate ORDER BY ApexClassOrTrigger.Name\" --target-org dev --result-format json")
```

Check current overall coverage:

```
execute("sf apex run test --test-level RunLocalTests --code-coverage --result-format json --wait 15 --target-org dev")
```

## Workflow

### Step 1: Analyze Existing Coverage

Get a coverage report for all Apex classes:

```
execute("sf apex run test --test-level RunLocalTests --code-coverage --result-format human --wait 15 --target-org dev")
```

Identify uncovered classes:

```
execute("sf data query --query \"SELECT ApexClassOrTrigger.Name, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate WHERE NumLinesUncovered > 0 ORDER BY NumLinesUncovered DESC\" --target-org dev --result-format table")
```

Prioritize: focus on classes with the lowest coverage first, especially triggers and service classes.

### Step 2: Create TestDataFactory

Every project needs a centralized test data factory. Create one:

```apex
// force-app/main/default/classes/TestDataFactory.cls
@isTest
public class TestDataFactory {

    /**
     * Create test accounts
     */
    public static List<Account> createAccounts(Integer count) {
        List<Account> accounts = new List<Account>();
        for (Integer i = 0; i < count; i++) {
            accounts.add(new Account(
                Name = 'Test Account ' + i,
                Industry = 'Technology',
                BillingStreet = '123 Test St',
                BillingCity = 'San Francisco',
                BillingState = 'CA',
                BillingPostalCode = '94105',
                BillingCountry = 'US'
            ));
        }
        insert accounts;
        return accounts;
    }

    /**
     * Create test contacts linked to accounts
     */
    public static List<Contact> createContacts(Integer count, Id accountId) {
        List<Contact> contacts = new List<Contact>();
        for (Integer i = 0; i < count; i++) {
            contacts.add(new Contact(
                FirstName = 'Test',
                LastName = 'Contact ' + i,
                Email = 'test.contact' + i + '@example.com',
                AccountId = accountId,
                Phone = '555-000-' + String.valueOf(i).leftPad(4, '0')
            ));
        }
        insert contacts;
        return contacts;
    }

    /**
     * Create test opportunities
     */
    public static List<Opportunity> createOpportunities(Integer count, Id accountId) {
        List<Opportunity> opps = new List<Opportunity>();
        for (Integer i = 0; i < count; i++) {
            opps.add(new Opportunity(
                Name = 'Test Opportunity ' + i,
                AccountId = accountId,
                StageName = 'Prospecting',
                CloseDate = Date.today().addDays(30),
                Amount = 10000 + (i * 1000)
            ));
        }
        insert opps;
        return opps;
    }

    /**
     * Create a user with a specific profile
     */
    public static User createUser(String profileName) {
        Profile p = [SELECT Id FROM Profile WHERE Name = :profileName LIMIT 1];
        String uniqueKey = String.valueOf(DateTime.now().getTime());
        User u = new User(
            FirstName = 'Test',
            LastName = 'User ' + uniqueKey,
            Email = 'testuser' + uniqueKey + '@example.com',
            Username = 'testuser' + uniqueKey + '@example.com.test',
            Alias = 'tuser',
            TimeZoneSidKey = 'America/Los_Angeles',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US',
            ProfileId = p.Id
        );
        insert u;
        return u;
    }

    /**
     * Create test cases
     */
    public static List<Case> createCases(Integer count, Id accountId, Id contactId) {
        List<Case> cases = new List<Case>();
        for (Integer i = 0; i < count; i++) {
            cases.add(new Case(
                Subject = 'Test Case ' + i,
                AccountId = accountId,
                ContactId = contactId,
                Status = 'New',
                Priority = 'Medium',
                Origin = 'Web'
            ));
        }
        insert cases;
        return cases;
    }
}
```

Deploy the factory:

```
execute("sf project deploy start --source-dir force-app/main/default/classes/TestDataFactory.cls force-app/main/default/classes/TestDataFactory.cls-meta.xml --target-org dev")
```

### Step 3: Write Unit Tests

For each class that needs coverage, generate a test class following this template:

```apex
@isTest
private class MyServiceTest {

    @TestSetup
    static void setupData() {
        // Use TestDataFactory to create shared test data
        List<Account> accounts = TestDataFactory.createAccounts(5);
        List<Contact> contacts = TestDataFactory.createContacts(3, accounts[0].Id);
        List<Opportunity> opps = TestDataFactory.createOpportunities(2, accounts[0].Id);
    }

    // Positive test: normal expected behavior
    @isTest
    static void testProcessRecords_Success() {
        List<Account> accounts = [SELECT Id, Name FROM Account];

        Test.startTest();
        MyService.processRecords(accounts);
        Test.stopTest();

        // Assert expected outcomes
        List<Account> updated = [SELECT Id, Name, Description FROM Account];
        System.assertEquals(5, updated.size(), 'Should have 5 accounts');
        for (Account a : updated) {
            System.assertNotEquals(null, a.Description, 'Description should be populated');
        }
    }

    // Negative test: error conditions
    @isTest
    static void testProcessRecords_NullInput() {
        Test.startTest();
        try {
            MyService.processRecords(null);
            System.assert(false, 'Should have thrown exception');
        } catch (MyService.ServiceException e) {
            System.assert(e.getMessage().contains('cannot be null'),
                'Exception message should mention null: ' + e.getMessage());
        }
        Test.stopTest();
    }

    // Bulk test: verify governor limit compliance
    @isTest
    static void testProcessRecords_Bulk200() {
        List<Account> accounts = TestDataFactory.createAccounts(200);

        Test.startTest();
        MyService.processRecords(accounts);
        Test.stopTest();

        System.assertEquals(200, [SELECT COUNT() FROM Account],
            'All 200 accounts should be processed');
    }

    // Permission test: verify FLS/sharing
    @isTest
    static void testProcessRecords_StandardUser() {
        User stdUser = TestDataFactory.createUser('Standard User');

        System.runAs(stdUser) {
            List<Account> accounts = TestDataFactory.createAccounts(1);

            Test.startTest();
            MyService.processRecords(accounts);
            Test.stopTest();
        }
    }
}
```

### Step 4: Write Trigger Tests

Test triggers through DML operations:

```apex
@isTest
private class AccountTriggerTest {

    @isTest
    static void testBeforeInsert() {
        Test.startTest();
        Account acc = new Account(Name = 'Trigger Test Account');
        insert acc;
        Test.stopTest();

        Account result = [SELECT Id, Name, Description FROM Account WHERE Id = :acc.Id];
        // Assert trigger logic was applied
        System.assertNotEquals(null, result.Description, 'Trigger should populate Description');
    }

    @isTest
    static void testBeforeUpdate() {
        Account acc = TestDataFactory.createAccounts(1)[0];

        Test.startTest();
        acc.Name = 'Updated Name';
        update acc;
        Test.stopTest();

        Account result = [SELECT Id, Name FROM Account WHERE Id = :acc.Id];
        System.assertEquals('Updated Name', result.Name);
    }

    @isTest
    static void testAfterDelete() {
        Account acc = TestDataFactory.createAccounts(1)[0];
        Id accId = acc.Id;

        Test.startTest();
        delete acc;
        Test.stopTest();

        // Verify cascade effects
        System.assertEquals(0, [SELECT COUNT() FROM Contact WHERE AccountId = :accId]);
    }

    @isTest
    static void testBulkInsert() {
        Test.startTest();
        List<Account> accounts = new List<Account>();
        for (Integer i = 0; i < 200; i++) {
            accounts.add(new Account(Name = 'Bulk Account ' + i));
        }
        insert accounts;
        Test.stopTest();

        System.assertEquals(200, [SELECT COUNT() FROM Account WHERE Name LIKE 'Bulk Account%']);
    }
}
```

### Step 5: Write HTTP Callout Mocks

For classes that make external callouts:

```apex
@isTest
public class MockHttpResponse implements HttpCalloutMock {

    private Integer statusCode;
    private String body;

    public MockHttpResponse(Integer statusCode, String body) {
        this.statusCode = statusCode;
        this.body = body;
    }

    public HttpResponse respond(HttpRequest request) {
        HttpResponse response = new HttpResponse();
        response.setStatusCode(this.statusCode);
        response.setBody(this.body);
        response.setHeader('Content-Type', 'application/json');
        return response;
    }
}

@isTest
private class ExternalServiceTest {

    @isTest
    static void testCallout_Success() {
        String mockBody = '{"status": "success", "data": {"id": "123"}}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponse(200, mockBody));

        Test.startTest();
        String result = ExternalService.callApi('https://api.example.com/data');
        Test.stopTest();

        System.assertNotEquals(null, result);
        System.assert(result.contains('success'));
    }

    @isTest
    static void testCallout_Error() {
        Test.setMock(HttpCalloutMock.class, new MockHttpResponse(500, '{"error": "Internal Server Error"}'));

        Test.startTest();
        try {
            ExternalService.callApi('https://api.example.com/data');
            System.assert(false, 'Should have thrown CalloutException');
        } catch (ExternalService.CalloutException e) {
            System.assert(e.getMessage().contains('500'));
        }
        Test.stopTest();
    }

    @isTest
    static void testCallout_Timeout() {
        Test.setMock(HttpCalloutMock.class, new MockHttpResponse(408, ''));

        Test.startTest();
        try {
            ExternalService.callApi('https://api.example.com/data');
        } catch (Exception e) {
            System.assert(true, 'Timeout handled');
        }
        Test.stopTest();
    }
}
```

### Step 6: Write Batch Apex Tests

```apex
@isTest
private class MyBatchJobTest {

    @TestSetup
    static void setup() {
        TestDataFactory.createAccounts(200);
    }

    @isTest
    static void testBatchExecution() {
        Test.startTest();
        MyBatchJob batch = new MyBatchJob();
        Id jobId = Database.executeBatch(batch, 200);
        Test.stopTest();

        // Verify batch results
        AsyncApexJob job = [SELECT Status, NumberOfErrors, JobItemsProcessed
                            FROM AsyncApexJob WHERE Id = :jobId];
        System.assertEquals('Completed', job.Status);
        System.assertEquals(0, job.NumberOfErrors);
    }

    @isTest
    static void testBatchWithErrors() {
        // Create data that will cause errors
        Account badAccount = new Account(Name = null); // This will fail validation

        Test.startTest();
        MyBatchJob batch = new MyBatchJob();
        Database.executeBatch(batch, 200);
        Test.stopTest();

        // Verify error handling
    }
}
```

### Step 7: Run Tests and Analyze Coverage

Run all tests:

```
execute("sf apex run test --test-level RunLocalTests --code-coverage --result-format human --wait 15 --target-org dev")
```

Run specific test classes:

```
execute("sf apex run test --class-names TestDataFactory,MyServiceTest,AccountTriggerTest --code-coverage --wait 15 --target-org dev")
```

Run a single test method:

```
execute("sf apex run test --tests MyServiceTest.testProcessRecords_Success --wait 10 --target-org dev")
```

Get detailed coverage per class:

```
execute("sf data query --query \"SELECT ApexClassOrTrigger.Name, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate ORDER BY NumLinesUncovered DESC\" --target-org dev --result-format table")
```

### Step 8: Achieve 75% Coverage Threshold

If coverage is below 75%, identify the gaps:

```
execute("sf apex get test --test-run-id <run-id> --code-coverage --target-org dev")
```

Common coverage gaps and fixes:
- **Catch blocks**: Force exceptions in tests by passing invalid data
- **Conditional branches**: Test both `if` and `else` paths
- **Null checks**: Pass null values to hit null-handling code
- **Governor limit handlers**: Use `Test.startTest()`/`Test.stopTest()` to reset limits
- **Batch/Queueable finish methods**: Run `Database.executeBatch` inside `Test.startTest()`/`Test.stopTest()`

### Step 9: Set Up Continuous Test Monitoring

Create a scheduled job to run tests periodically:

```apex
public class ScheduledTestRunner implements Schedulable {
    public void execute(SchedulableContext sc) {
        // Enqueue test run
        ApexTestQueueItem[] tests = new ApexTestQueueItem[]{};
        for (ApexClass testClass : [SELECT Id FROM ApexClass WHERE Name LIKE '%Test']) {
            tests.add(new ApexTestQueueItem(ApexClassId = testClass.Id));
        }
        if (!tests.isEmpty()) {
            ApexTestRunResult run = Test.enqueueSuite(tests);
        }
    }
}
```

Schedule it:

```
execute("sf apex run --file scripts/schedule-tests.apex --target-org dev")
```

```apex
// scripts/schedule-tests.apex
System.schedule('Nightly Test Run', '0 0 2 * * ?', new ScheduledTestRunner());
```

## Test Patterns Reference

### Assert Best Practices

```apex
// Use descriptive assertion messages
System.assertEquals(expected, actual, 'Description of what went wrong');

// Assert collections
System.assertEquals(5, results.size(), 'Should return 5 records');
System.assert(!results.isEmpty(), 'Results should not be empty');

// Assert exceptions
try {
    riskyMethod();
    System.assert(false, 'Expected exception was not thrown');
} catch (SpecificException e) {
    System.assert(e.getMessage().contains('expected text'));
}

// Assert DML results
Database.SaveResult[] results = Database.insert(records, false);
for (Database.SaveResult sr : results) {
    System.assert(sr.isSuccess(), 'Insert should succeed: ' + sr.getErrors());
}
```

### Test.startTest() / Test.stopTest() Usage

```apex
// Reset governor limits for the code under test
Test.startTest();
// Code between start/stop gets fresh governor limits
MyService.heavyOperation();
Test.stopTest();
// Async operations (future, batch, queueable) complete after stopTest
```

## Error Handling & Troubleshooting

### "System.AssertException: Assertion Failed"
- Read the assertion message to understand which check failed
- Query the data in the test to verify state before the assertion
- Add `System.debug()` statements before assertions to trace values

### Tests pass individually but fail together
- Tests may share data due to missing `@isTest(SeeAllData=false)`
- Use `@TestSetup` for isolated data per test class
- Check for static variables that persist across test methods

### "MIXED_DML_OPERATION" in tests
- Separate setup DML (User creation) from non-setup DML (Account creation)
- Use `System.runAs()` to create a context boundary between DML types

### Coverage shows 0% for a class
- Test class must use `@isTest` annotation
- Test methods must be `static void` with `@isTest` annotation
- Verify the test actually exercises the target class (not just data setup)

### Tests timeout
- Reduce data volume in tests (use 5-10 records unless testing bulk behavior)
- Move expensive setup to `@TestSetup` (runs once per class, not per method)
- Avoid `Test.loadData` with large static resources

### Flaky tests
- Remove dependency on record IDs (use SOQL to query by name)
- Don't depend on record order — sort results or use maps
- Use `Test.startTest()`/`Test.stopTest()` to ensure async completion
