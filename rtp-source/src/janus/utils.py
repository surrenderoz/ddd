import random
import string


def random_string(length: int, letters: bool = True, digits: bool = True) -> str:
    allchar = ''
    allchar += string.ascii_letters if letters else ''
    allchar += string.digits if digits else ''
    if not allchar:
        raise ValueError('No chars to make random string!')
    return "".join(random.choice(allchar) for _ in range(length))


def transaction_id():
    return random_string(12)


def normalize_url(base_url: str, *args: str):
    ret = [base_url.strip(' /'),]
    ret.extend([a.strip(' /') for a in args])
    return '/'.join(ret) + '/'
