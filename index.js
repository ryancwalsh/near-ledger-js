
import "regenerator-runtime/runtime";

import TransportU2F from "@ledgerhq/hw-transport-u2f";

export async function createTransport() {
    const transport = await TransportU2F.create();
    transport.setScrambleKey("NEAR");
    return transport;
}

function bip32PathToBytes(path) {
    const parts = path.split('/');
    return Buffer.concat(
        parts
            .map(part => part.endsWith(`'`)
                ? Math.abs(parseInt(part.slice(0, -1))) | 0x80000000
                : Math.abs(parseInt(part)))
            .map(i32 => Buffer.from([
                (i32 >> 24) & 0xFF,
                (i32 >> 16) & 0xFF,
                (i32 >> 8) & 0xFF,
                i32 & 0xFF,
            ])));
}

const networkId = 'W'.charCodeAt(0);

export async function createClient() {
    const transport = await createTransport();
    return {
        transport,
        async getVersion() {
            const response = await this.transport.send(0x80, 6, 0, 0);
            const [major, minor, patch] = Array.from(response);
            return `${major}.${minor}.${patch}`;
        },
        async getPublicKey(path) {
            path = path || "44'/397'/0'/0'/1'";
            const response = await this.transport.send(0x80, 4, 0, networkId, bip32PathToBytes(path));
            return Buffer.from(response.subarray(0, -2));
        },
        async sign(path, transactionData) {
            transactionData = Buffer.from(transactionData);
            // 128 - 5 service bytes
            const CHUNK_SIZE = 123
            const allData = Buffer.concat([bip32PathToBytes(path), transactionData]);
            for (let offset = 0; offset < allData.length; offset += CHUNK_SIZE) {
                const chunk = Buffer.from(allData.subarray(offset, offset + CHUNK_SIZE));
                const isLastChunk = offset + CHUNK_SIZE >= allData.length;
                const response = await this.transport.send(0x80, 2, isLastChunk ? 0x80 : 0, networkId, chunk);
                if (isLastChunk) {
                    return Buffer.from(response.subarray(0, -2));
                }
            }
        }
    }
}