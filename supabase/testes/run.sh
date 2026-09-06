#!/bin/bash
# run.sh <user_uuid> <sql>   -> executa como aquele usuario, com RLS ativo
psql -h /tmp -p 5599 -U postgres -d axus -tA <<PSQL
SET request.jwt.claim.sub = '$1';
SET ROLE authenticated;
$2
PSQL
