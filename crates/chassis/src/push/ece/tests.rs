//! RFC 8291 Appendix A, byte for byte: the fixed keys, salt and plaintext of
//! the RFC's example go through the same derivation the live code uses, and
//! every intermediate value and the final body must equal the RFC's text.
//! (ring cannot load a fixed private key, so the ECDH secret the RFC lists
//! is injected; the key agreement itself is proven by the round trip in
//! the delivery tests, which decrypt with a key pair ring generated.)

use super::*;
use crate::push::b64::{decode, encode};

fn b(text: &str) -> Vec<u8> {
    decode(&text.split_whitespace().collect::<String>()).expect("valid base64url")
}

const UA_PUBLIC: &str =
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const AS_PUBLIC: &str =
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg Dll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
const AUTH: &str = "BTBZMqHH6r4Tts7J_aSIgg";
const SALT: &str = "DGv6ra1nlYgDCS1FRnbzlw";
const ECDH: &str = "kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs";
const IKM: &str = "S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg";
const CEK: &str = "oIhVW04MRdy2XN9CiKLxTg";
const NONCE: &str = "4h_95klXJ5E_qnoN";
const PLAINTEXT: &str = "When I grow up, I want to be a watermelon";
const BODY: &str = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml \
mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT \
pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

#[test]
fn the_rfc_8291_intermediate_values_come_out_exactly() {
    let ikm = derive_ikm(&b(ECDH), &b(UA_PUBLIC), &b(AS_PUBLIC), &b(AUTH)).unwrap();
    assert_eq!(encode(&ikm), IKM);
    let (cek, nonce) = derive_content_keys(&ikm, &b(SALT)).unwrap();
    assert_eq!(encode(&cek), CEK);
    assert_eq!(encode(&nonce), NONCE);
}

#[test]
fn the_rfc_8291_message_is_reproduced_byte_for_byte() {
    let salt: [u8; 16] = b(SALT).try_into().unwrap();
    let body = encrypt_with(
        &b(ECDH),
        &b(AS_PUBLIC),
        &b(UA_PUBLIC),
        &b(AUTH),
        &salt,
        PLAINTEXT.as_bytes(),
    )
    .unwrap();
    assert_eq!(body, b(BODY));
    // The header the RFC lists separately: salt, 4096, 65, the sender key.
    assert_eq!(&body[16..21], &[0, 0, 0x10, 0, 65]);
}

#[test]
fn a_payload_that_cannot_fit_one_message_is_refused_with_a_remedy() {
    let salt = [7u8; 16];
    let big = vec![b'x'; MAX_PLAINTEXT + 1];
    let err = encrypt_with(
        &b(ECDH),
        &b(AS_PUBLIC),
        &b(UA_PUBLIC),
        &b(AUTH),
        &salt,
        &big,
    )
    .unwrap_err();
    assert!(err.message.contains("at most"), "{}", err.message);
    let exact = vec![b'x'; MAX_PLAINTEXT];
    let body = encrypt_with(
        &b(ECDH),
        &b(AS_PUBLIC),
        &b(UA_PUBLIC),
        &b(AUTH),
        &salt,
        &exact,
    )
    .unwrap();
    assert_eq!(
        body.len(),
        4096,
        "a full message is exactly the size every service accepts"
    );
}

#[test]
fn a_receiver_with_malformed_keys_is_refused_before_any_maths() {
    assert!(check_receiver(&b(UA_PUBLIC), &b(AUTH)).is_ok());
    assert!(
        check_receiver(&b(UA_PUBLIC)[..64], &b(AUTH)).is_err(),
        "short key"
    );
    let mut compressed = b(UA_PUBLIC);
    compressed[0] = 0x02;
    assert!(
        check_receiver(&compressed, &b(AUTH)).is_err(),
        "not uncompressed"
    );
    assert!(
        check_receiver(&b(UA_PUBLIC), &b(AUTH)[..15]).is_err(),
        "short auth"
    );
    assert!(encrypt(&b(UA_PUBLIC)[..10], &b(AUTH), b"x").is_err());
}
