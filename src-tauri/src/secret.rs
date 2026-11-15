use keyring::{Entry, Error};

pub fn read(service: &str, account: &str) -> Result<Option<String>, Error> {
    match Entry::new(service, account)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn write(service: &str, account: &str, secret: &str) -> Result<(), Error> {
    let entry = Entry::new(service, account)?;

    if !secret.is_empty() {
        return entry.set_password(secret);
    }

    match entry.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(e),
    }
}
