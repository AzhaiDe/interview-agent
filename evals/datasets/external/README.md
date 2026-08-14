# External datasets

Do not commit third-party datasets here by default. For every acquired dataset:

1. archive the exact terms/license and access date;
2. record its checksum and upstream version;
3. keep restricted raw data outside Git;
4. write a deterministic adapter that produces an evaluation-only normalized
   form;
5. prevent training on the held-out test split.

The Tianchi dataset remains blocked until its account-visible usage terms have
been reviewed. The LREC JD corpus is non-commercial and must remain in a
separate research-only track.

