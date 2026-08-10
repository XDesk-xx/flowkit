# Action: review-apply

- Run: `20260806-165-review-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q2 orchestration-authority-boundary-correction`
- Role: Reviewer
- Review target: `20260806-164-revise-apply`

## Review scope

从 146 起整体复核当前 Q2 generation，并以 164 revise-apply 为当前 target。Reviewer 只判断 authority boundary、frozen invariant、lineage、implementation、tests 与 detached verification；不替 Owner 选择 Archive/Checkpoint lifecycle contract，也不修改 Author artifacts、production code、tests 或 Manifest。
