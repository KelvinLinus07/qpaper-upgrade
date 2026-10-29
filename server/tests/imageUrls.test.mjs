import test from 'node:test'
import assert from 'node:assert/strict'
import {objectKeyToImageUrl, imageParamsToKey, isAcceptedImageUrl, resolveLegacyImageUrl} from '../src/imageUrls.js'

const owner='9a3e49a2-995c-4094-bb9e-34ea05d8f654'
const file='7d5d2c6b-1e14-465b-85ba-e68b3c995c9a.png'
const key=`questions/${owner}/${file}`
const url=`/api/uploads/image/${owner}/${file}`

test('uploaded object key creates a stable same-origin URL',()=>{
 assert.equal(objectKeyToImageUrl(key),url)
 assert.equal(imageParamsToKey(owner,file),key)
 assert.equal(isAcceptedImageUrl(url),true)
})
test('uploaded image URLs remain safe to store in relational papers',()=>{
 assert.equal(isAcceptedImageUrl('https://images.example.com/questions/a.png'),true)
 assert.equal(isAcceptedImageUrl(null),false)
 assert.equal(isAcceptedImageUrl('//evil.example.com/image'),false)
 assert.equal(isAcceptedImageUrl('javascript:alert(1)'),false)
 assert.equal(isAcceptedImageUrl('/api/uploads/image/../../../.env'),false)
 assert.equal(isAcceptedImageUrl('/api/uploads/image/no/abc.png'),false)
 assert.equal(imageParamsToKey(owner,'../../.env'),null)
 assert.equal(imageParamsToKey('notuuid',file),null)
 assert.throws(()=>objectKeyToImageUrl('other/private/key.png'),/Invalid/)
})
test('old R2 public URLs load through the proxy when configured',()=>{
 const old=`https://example.r2.dev/${key}`
 assert.equal(resolveLegacyImageUrl(old,'https://example.r2.dev/'),url)
 assert.equal(resolveLegacyImageUrl(old,'https://other.example.com'),old)
 assert.equal(resolveLegacyImageUrl('https://example.r2.dev/other/key','https://example.r2.dev'), 'https://example.r2.dev/other/key')
 assert.equal(resolveLegacyImageUrl(old,''),old)
})
