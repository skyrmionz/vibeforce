/**
 * Deep Salesforce test coverage and testing patterns prompt.
 */

export const SF_TESTING_PROMPT = `# Salesforce Testing — Deep Reference

## The 75% Rule

Salesforce requires a MINIMUM of 75% code coverage across all Apex classes and triggers to deploy to production. Individual classes do not need 75%, but the org-wide average must meet it. However, best practice is 80%+ per class.

Additionally:
- Every trigger must have at least 1% coverage (effectively: at least one test that fires the trigger).
- System.assert statements are NOT required for coverage, but are required for meaningful tests.
- Test classes themselves (@isTest) do NOT count toward the coverage denominator.

## Test Class Structure

\\\`\\\`\\\`apex
@isTest
private class AccountServiceTest {

    @TestSetup
    static void makeData() {
        // Runs ONCE before all test methods. Data is rolled back per method.
        List<Account> accounts = TestDataFactory.createAccounts(5);
        insert accounts;
        List<Contact> contacts = TestDataFactory.createContactsForAccounts(accounts, 2);
        insert contacts;
    }

    @isTest
    static void testCreateAccount_positive() {
        // Arrange
        Account acc = new Account(Name = 'Test Corp', Industry = 'Technology');

        // Act
        Test.startTest();
        AccountService.createWithDefaults(acc);
        Test.stopTest();

        // Assert
        Account result = [SELECT Id, Name, BillingCountry FROM Account WHERE Name = 'Test Corp'];
        System.assertNotEquals(null, result, 'Account should have been created');
        System.assertEquals('US', result.BillingCountry, 'Default country should be US');
    }

    @isTest
    static void testCreateAccount_negative_nullName() {
        Account acc = new Account(Name = null);

        Test.startTest();
        try {
            AccountService.createWithDefaults(acc);
            System.assert(false, 'Should have thrown exception');
        } catch (AccountService.ValidationException e) {
            System.assert(e.getMessage().contains('Name is required'));
        }
        Test.stopTest();
    }

    @isTest
    static void testCreateAccount_bulk() {
        List<Account> accounts = TestDataFactory.createAccounts(200);

        Test.startTest();
        AccountService.createWithDefaults(accounts);
        Test.stopTest();

        System.assertEquals(200, [SELECT COUNT() FROM Account WHERE Name LIKE 'Test Account%']);
    }
}
\\\`\\\`\\\`

## @TestSetup Best Practices

- Runs once, data available to ALL test methods in the class via SOQL queries.
- Each test method gets its own copy (rolled back after each method).
- Reduces redundant setup code and test execution time.
- Cannot use @TestSetup in classes that have @isTest(SeeAllData=true).
- @TestSetup methods must be static void with no parameters.

## TestDataFactory Pattern

\\\`\\\`\\\`apex
@isTest
public class TestDataFactory {

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
        return accounts; // Caller decides when to insert
    }

    public static List<Contact> createContactsForAccounts(List<Account> accounts, Integer contactsPerAccount) {
        List<Contact> contacts = new List<Contact>();
        for (Account acc : accounts) {
            for (Integer i = 0; i < contactsPerAccount; i++) {
                contacts.add(new Contact(
                    FirstName = 'Test',
                    LastName = 'Contact ' + i,
                    AccountId = acc.Id,
                    Email = 'test' + i + '@' + acc.Name.replaceAll(' ', '') + '.com'
                ));
            }
        }
        return contacts;
    }

    public static User createStandardUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        return new User(
            Alias = 'tuser',
            Email = 'testuser@test.harnessforce.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'TestUser',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'America/Los_Angeles',
            UserName = 'testuser' + DateTime.now().getTime() + '@test.harnessforce.com'
        );
    }
}
\\\`\\\`\\\`

## System.runAs() — Testing Security

\\\`\\\`\\\`apex
@isTest
static void testFieldLevelSecurity() {
    User standardUser = TestDataFactory.createStandardUser();
    insert standardUser;

    System.runAs(standardUser) {
        // Code runs as this user — FLS, sharing rules, profile permissions apply
        Account acc = new Account(Name = 'Restricted Corp');
        insert acc;
        // Assert the user can/cannot see certain fields
    }
}
\\\`\\\`\\\`

System.runAs():
- Enforces FLS, CRUD, sharing rules for the specified user
- Resets governor limits (gives a fresh set of limits inside the block)
- Does NOT enforce profile-based page layout restrictions

## Test.startTest() / Test.stopTest()

- Resets governor limits — code between start/stop gets a FRESH set of limits
- Forces async operations (@future, Queueable, Batch) to execute synchronously
- Should wrap ONLY the code under test, not the setup
- Only ONE startTest/stopTest pair per test method

## Mock Patterns for HTTP Callouts

### HttpCalloutMock Interface
\\\`\\\`\\\`apex
@isTest
global class MockHttpResponse implements HttpCalloutMock {
    global HTTPResponse respond(HTTPRequest req) {
        HttpResponse res = new HttpResponse();
        res.setHeader('Content-Type', 'application/json');
        res.setBody('{"status": "success", "id": "001xx000003ABCDE"}');
        res.setStatusCode(200);
        return res;
    }
}

@isTest
static void testCallout() {
    Test.setMock(HttpCalloutMock.class, new MockHttpResponse());

    Test.startTest();
    String result = ExternalService.makeCallout('https://api.example.com/data');
    Test.stopTest();

    System.assertEquals('success', result);
}
\\\`\\\`\\\`

### Multi-Request Mock (different responses per endpoint)
\\\`\\\`\\\`apex
@isTest
global class MultiMockHttpResponse implements HttpCalloutMock {
    global HTTPResponse respond(HTTPRequest req) {
        HttpResponse res = new HttpResponse();
        res.setHeader('Content-Type', 'application/json');

        if (req.getEndpoint().contains('/accounts')) {
            res.setBody('{"accounts": []}');
            res.setStatusCode(200);
        } else if (req.getEndpoint().contains('/contacts')) {
            res.setBody('{"contacts": []}');
            res.setStatusCode(200);
        } else {
            res.setBody('{"error": "Not Found"}');
            res.setStatusCode(404);
        }
        return res;
    }
}
\\\`\\\`\\\`

## Test Types to Always Include

### 1. Positive Tests
Verify the happy path works correctly with valid input.

### 2. Negative Tests
Verify proper error handling with invalid input, null values, missing required fields.

### 3. Bulk Tests
Insert/update 200+ records to verify triggers and automation handle bulk. This catches SOQL-in-loop and DML-in-loop violations.

### 4. User Permission Tests
Use System.runAs() to verify behavior under different profiles/permission sets.

### 5. Boundary Tests
Test with 0 records, 1 record, 200 records (trigger batch size), and edge-case field values (max length strings, dates at boundaries).

## @isTest Annotation Options

- @isTest — standard, SeeAllData defaults to false
- @isTest(SeeAllData=true) — test can see all org data (AVOID — makes tests fragile and org-dependent)
- @isTest(IsParallel=true) — allows parallel execution (no FOR UPDATE, no setup objects with unique constraints)

## Key Assertions

\\\`\\\`\\\`apex
System.assertEquals(expected, actual, 'Message on failure');
System.assertNotEquals(unexpected, actual, 'Message');
System.assert(condition, 'Message');
// In API v60.0+:
Assert.areEqual(expected, actual, 'Message');
Assert.areNotEqual(unexpected, actual, 'Message');
Assert.isTrue(condition, 'Message');
Assert.isFalse(condition, 'Message');
Assert.isNull(value, 'Message');
Assert.isNotNull(value, 'Message');
Assert.fail('Should not reach here');
Assert.isInstanceOfType(obj, ExpectedType.class, 'Message');
\\\`\\\`\\\`

## Common Testing Mistakes

1. NO assertions — test runs code but never verifies results (gives coverage but no safety)
2. SeeAllData=true — depends on existing org data, breaks when data changes
3. Hardcoded IDs — never hardcode record IDs, RecordType IDs, or Profile IDs by value
4. Not testing bulk — single-record tests pass but bulk operations hit governor limits
5. Not testing as different users — missing permission/sharing issues that appear in production
6. Inserting data outside @TestSetup — duplicates setup work across methods
`;
