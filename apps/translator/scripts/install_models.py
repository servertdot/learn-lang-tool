import argostranslate.package
import argostranslate.translate


MODELS = [
    ("en", "ru"),
]


def is_model_installed(from_code: str, to_code: str) -> bool:
    translator = argostranslate.translate.get_translation_from_codes(
        from_code,
        to_code,
    )

    return translator is not None


def main() -> None:
    missing_models = [
        model
        for model in MODELS
        if not is_model_installed(*model)
    ]

    if not missing_models:
        print("All models are already installed")
        return

    argostranslate.package.update_package_index()
    available_packages = argostranslate.package.get_available_packages()

    for from_code, to_code in missing_models:
        package = next(
            (
                package
                for package in available_packages
                if package.from_code == from_code
                and package.to_code == to_code
            ),
            None,
        )

        if package is None:
            raise RuntimeError(
                f"Model {from_code} → {to_code} was not found"
            )

        print(f"Downloading {from_code} → {to_code}...")
        package_path = package.download()

        print(f"Installing {from_code} → {to_code}...")
        argostranslate.package.install_from_path(package_path)

    print("All models installed")


if __name__ == "__main__":
    main()
