import os
import sys
from google import genai
from google.genai import types
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
load_dotenv()

def generate_image_google(prompt, output_path):
    """
    Generates an image using Google's Imagen model (via the new google-genai SDK).
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("Error: GOOGLE_API_KEY environment variable not set in .env.")
        sys.exit(1)

    # Initialize the new GenAI client
    client = genai.Client(api_key=api_key)

    print(f"Generating image (Google Imagen) for prompt: {prompt}")
    try:
        # Using the exact model name from the list_models() output
        response = client.models.generate_images(
            model='imagen-3.0-generate-001',
            prompt=prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1,
                include_rai_reason=True,
                output_mime_type='image/png'
            )
        )

        if not response.generated_images:
            print(f"Error: No image was generated. Response: {response}")
            sys.exit(1)

        image_data = response.generated_images[0].image.image_bytes

        # Ensure the directory exists
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)

        with open(output_file, 'wb') as handler:
            handler.write(image_data)

        print(f"Image successfully saved to: {output_path}")

    except Exception as e:
        print(f"An error occurred: {e}")
        print("\nNote: If this is a 403 or 'Pay-as-you-go' error, Imagen requires a Paid tier.")
        print("In Google AI Studio, look for the 'Plan' or 'Billing' section to switch to Pay-as-you-go.")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python generate_image_google.py \"<prompt>\" \"<output_path>\"")
        sys.exit(1)

    prompt_arg = sys.argv[1]
    path_arg = sys.argv[2]

    generate_image_google(prompt_arg, path_arg)
