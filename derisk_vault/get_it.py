import urllib.request, re

hashes = []
endpoints = [
    b'{"jsonrpc":"2.0","id":1,"method":"info_get_transaction","params":{"transaction_hash":"6d9a408a7f2dd456c882052271a77e3b1c2d1e74c99ecd4684560260e3003b22"}}',
    b'{"jsonrpc":"2.0","id":1,"method":"info_get_deploy","params":{"deploy_hash":"6d9a408a7f2dd456c882052271a77e3b1c2d1e74c99ecd4684560260e3003b22"}}'
]

for payload in endpoints:
    try:
        req = urllib.request.Request('https://node.testnet.casper.network/rpc', data=payload, headers={'Content-Type':'application/json'})
        resp = urllib.request.urlopen(req).read().decode()
        hashes.extend(re.findall(r'[a-zA-Z0-9_-]*[0-9a-f]{64}', resp))
    except:
        pass

bad = ['account', 'block', 'parent', 'state', 'transfer', '6d9a408a7f2dd456c882052271a77e3b1c2d1e74c99ecd4684560260e3003b22']
clean_hashes = set([h for h in hashes if not any(b in h for b in bad)])

print('\n' + '█'*60)
print('✅ RAW IDENTIFIERS PULLED FROM THE BLOCKCHAIN:')
for h in clean_hashes:
    print(f'   -> {h}')
print('█'*60 + '\n')
print('Look for the one starting with "entity-" or "contract-" and put it in your .env!\n')
