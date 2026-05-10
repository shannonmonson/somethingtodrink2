# Security Specification for Beverage Archive

## Data Invariants
1. A user can only create/update their own profile.
2. A post must belong to the authenticated user.
3. Users can only delete their own posts.
4. Follows must correctly identify both follower and followed.

## The Dirty Dozen (Threat Vectors)
1. User A tries to change User B's bio.
2. Unauthenticated user tries to post a beverage.
3. User A tries to delete User B's post.
4. User A tries to create a post with User B's UID in the payload.
5. User A tries to follow themselves.
6. Malicious payload injecting 1MB strings into beverage names.
7. Attempting to bypass 'rating' enum with a string.
8. Attempting to update 'createdAt' field on an existing post.
9. Attempting to change 'userId' on a post.
10. Attempting to list all users' private info (if any).
11. Attempting to spoof 'userName' in a post to be someone else.
12. Attempting to flood the 'follows' collection with junk IDs.

## Test Strategy (Conceptual)
All writes must be validated by `isValidUserProfile`, `isValidPost`, or `isValidFollow`.
Identity must be verified using `request.auth.uid`.
Immutability of `userId` and `createdAt` must be enforced.
